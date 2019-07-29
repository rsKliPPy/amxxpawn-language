'use strict';

import * as VSCLS from 'vscode-languageserver';
import * as StringHelpers from '../common/string-helpers';
import * as Types from './types';
import * as Helpers from './helpers';
import * as DM from './dependency-manager';
import Uri from 'vscode-uri';

interface FindFunctionIdentifierResult {
    identifier: string,
    parameterIndex?: number;
};

interface SpecifierResults {
    isStatic: boolean;
    isPublic: boolean;
    isConst: boolean;
    isStock: boolean;

    position: number;
    wrongCombination: boolean;
};

interface IdentifierResults {
    token: string;
    position: number;
}

// 1 = storage specifiers
// 2 = tag
// 3 = identifier
// 4 = parameters
const callableRegex = /([\w\s]*?)([A-Za-z_@][\w_@]+\s*:\s*)?([A-Za-z_@][\w_@]+)\s*\((.*?)\)/;

let docComment = "";


function positionToIndex(content: string, position: VSCLS.Position) {
    let line = 0;
    let index = 0;
    while(line !== position.line) {
        if(content[index] === '\n') {
            ++line;
        }
        ++index;
    }

    return index + position.character;
}

function findFunctionIdentifier(content: string, cursorIndex: number): FindFunctionIdentifierResult {
    let index = cursorIndex - 1;
    let parenthesisDepth = 0;
    let identifier = '';
    let parameterIndex = 0;

    while(index >= 0) {
        // We surely know that we shouldn't search further if we encounter a semicolon
        if(content[index] === ';') {
            return { identifier: '' };
        }
        if(content[index] === ',' && parenthesisDepth === 0) {
            ++parameterIndex;
        }
        if(content[index] === ')') { // Ignore the next '(', it's a nested call
            ++parenthesisDepth;
            --index;
            continue;
        }
        if(content[index] === '(') {
            if(parenthesisDepth > 0) {
                --parenthesisDepth;
                --index;
                continue;
            }

            // Identifier preceding this '(' is the function we are looking for
            // Skip all whitespaces first
            while(StringHelpers.isWhitespace(content[--index])) { }
            // Copy the identifier
            while(index >= 0 && StringHelpers.isAlphaNum(content[index])) {
                identifier += content[index];
                --index;
            }
            // Remove all digits from the end, an identifier can't start with a digit
            let identIndex = identifier.length;
            while(--identIndex >= 0 && StringHelpers.isDigit(identifier[identIndex])) { }
            if(identIndex !== identifier.length - 1) {
                identifier = identifier.substring(0, identIndex + 1);
            }
            // Finally reverse it and return it
            return { identifier: StringHelpers.reverse(identifier), parameterIndex: parameterIndex };
        }

        --index;
    }
    
    return { identifier: '' };
}


function findIdentifierBehindCursor(content: string, cursorIndex: number): string {
    let index = cursorIndex - 1;
    let identifier = '';

    while(index >= 0) {
        if(StringHelpers.isAlphaNum(content[index])) {
            identifier += content[index];
            --index;
            continue;
        } else { // Reached the end of the identifier
            // Remove all digits from the end, an identifier can't start with a digit
            let identIndex = identifier.length;
            while(--identIndex >= 0 && StringHelpers.isDigit(identifier[identIndex])) { }
            if(identIndex !== identifier.length - 1) {
                identifier = identifier.substring(0, identIndex + 1);
            }

            return StringHelpers.reverse(identifier);
        }
    }

    return '';
}

function findIdentifierAtCursor(content: string, cursorIndex: number): { identifier: string, isCallable: boolean } {
    let result = {
        identifier: '',
        isCallable: false
    };

    if(!StringHelpers.isAlphaNum(content[cursorIndex])) {
        return result;
    }
    // Identifier must begin with alpha
    if(cursorIndex === 0 && StringHelpers.isDigit(content[cursorIndex])) {
        return result;
    }
    if(cursorIndex > 0 && StringHelpers.isDigit(content[cursorIndex]) && StringHelpers.isWhitespace(content[cursorIndex - 1])) {
        return result;
    }

    let index = cursorIndex;
    // Copy from the left side of cursor
    while(index >= 0) {
        if(StringHelpers.isAlphaNum(content[index])) {
            result.identifier += content[index];
            --index;
            continue;
        } else { // Reached the end of the identifier
            // Remove all digits from the end, an identifier can't start with a digit
            let identIndex = result.identifier.length;
            while(--identIndex >= 0 && StringHelpers.isDigit(result.identifier[identIndex])) { }
            if(identIndex !== result.identifier.length - 1) {
                result.identifier = result.identifier.substring(0, identIndex + 1);
            }

            // Reverse the left part
            result.identifier = StringHelpers.reverse(result.identifier);
            break;
        }
    }
    // Copy from the right side of cursor
    if(cursorIndex !== content.length - 1) {
        index = cursorIndex + 1;
        while(index < content.length) {
            if(StringHelpers.isAlphaNum(content[index])) {
                result.identifier += content[index];
                ++index;
                continue;
            } else { // Reached the end of the identifier
                // Try to figure out if it's a callable
                while(index < content.length && StringHelpers.isWhitespace(content[index])) {
                    ++index;
                }
                if(content[index] === '(') {
                    result.isCallable = true;
                }
                break;
            }
        }
    }
    

    return result;
}

function handleMultilineComments(lineContent: string, inComment: boolean): { content: string, inComment: boolean } {
    // Maybe this should just be a "copy characters until..." parser
    if(inComment === true) {
        const endCommentIndex = lineContent.indexOf('*/');
        if(endCommentIndex >= 0) {
            docComment += lineContent.substring(0, endCommentIndex + 2);
            return handleMultilineComments(lineContent.substring(endCommentIndex + 2), false);
        } else {
            docComment += lineContent + '\n';
        }
    } else {
        const commentIndex = lineContent.indexOf('/*');
        if(commentIndex >= 0) {
            docComment = "";
            const endCommentIndex = lineContent.indexOf('*/');
            if(endCommentIndex >= 0) {
                docComment = lineContent.substring(commentIndex, endCommentIndex + 2);
                return handleMultilineComments(lineContent.substring(0, commentIndex) + lineContent.substring(endCommentIndex + 2), false);
            } else {
                docComment = lineContent.substring(commentIndex) + '\n';
                return { content: lineContent.substring(0, commentIndex).trim(), inComment: true };
            }
        }
    }

    return { content: lineContent.trim(), inComment: inComment };
}

function handleComments(lineContent, inComment) {
    let commentIndex = lineContent.indexOf('//');
    if (commentIndex >= 0) {
        const matches = lineContent.match(/(".*\/\/.*")/);
        
        if (!matches) {
            lineContent = lineContent.substring(0, commentIndex).trim();
        }
    }
    return handleMultilineComments(lineContent, inComment);
}

function handleBracketDepth(lineContent: string): number {
    let bracketDepth = 0;
    let contentIndex = 0;

    while(contentIndex !== lineContent.length) {
        if(lineContent[contentIndex] === '{') ++bracketDepth;
        else if(lineContent[contentIndex] === '}') --bracketDepth;
        ++contentIndex;
    }

    return bracketDepth;
}

function readIdentifier(content: string, position: number): IdentifierResults {
    let token = '';
    
    // Skip whitespace first
    while(position !== content.length && content[position] !== ';' && StringHelpers.isWhitespace(content[position])) {
        ++position;
    }
    if(position === content.length || content[position] === ';') { // Reached the end
        return { token: '', position: content.length };
    }
    // Copy the identifier
    let checkFunc = StringHelpers.isAlpha;
    let firstPass = true;
    while(position !== content.length && content[position] != ';' && checkFunc(content[position])) {
        token += content[position];
        ++position;

        if(firstPass === true) {
            firstPass = false;
            checkFunc = StringHelpers.isAlphaNum;
        }
    }
    if(content[position] === ';') {
        return { token: token, position: content.length }; // A little hack when we reach the semicolon
    }

    return { token: token, position: position };
}

function readSpecicifers(content: string, position: number, initialToken: string): SpecifierResults {
    let results = {
        isStatic: false,
        isPublic: false,
        isConst: false,
        isStock: false,

        position: position,
        wrongCombination: false
    };

    switch(initialToken) {
        case 'static':
            results.isStatic = true;
            break;
        case 'public':
            results.isPublic = true;
            break;
        case 'const':
            results.isConst = true;
            break;
        case 'stock':
            results.isStock = true;
    }

    let tr: IdentifierResults = undefined;
    let previousPosition;
    do {
        previousPosition = (tr === undefined ? position : tr.position);
        tr = readIdentifier(content, previousPosition);
        switch(tr.token) {
            case 'static':
                if(results.isStatic || results.isPublic) {
                    results.wrongCombination = true;
                    break;
                }
                results.isStatic = true;
                break;
            case 'public':
                if(results.isPublic || results.isStatic) {
                    results.wrongCombination = true;
                    break;
                }
                results.isPublic = true;
                break;
            case 'const':
                if(results.isConst) {
                    results.wrongCombination = true;
                    break;
                }
                results.isConst = true;
                break;
            case 'stock':
                if(results.isStock) {
                    results.wrongCombination = true;
                    break;
                }
                results.isStock = true;
                break;
            case 'new':
                results.wrongCombination = true;
                break;
            default:
                results.position = previousPosition;
                tr = undefined;
                break;
        }
        // Can't have more specifiers after 'const' if it was the first one
        if(tr !== undefined && initialToken === 'const') {
            results.wrongCombination = true;
        }
    } while(tr !== undefined && results.wrongCombination !== true);

    if(results.wrongCombination === true) {
        results.position = tr.position;
    }

    return results;
}

function createValueLabel(identifier: string, tag: string, sr: SpecifierResults) {
    let label = '';
    let shouldAddNew = true;

    if(sr.isPublic === true) {
        label += 'public ';
    }
    if(sr.isStatic === true) {
        label += 'static ';
    }
    if(sr.isStock === true) {
        label += 'stock ';
    }
    if(sr.isConst === true) {
        label += 'const ';
    }
    if(label === '') {
        label += 'new ';
    }
    if(tag !== '') {
        label += (tag + ':');
    }
    label += identifier;

    return label;
}

export function parse(fileUri: Uri, content: string, skipStatic: boolean): Types.ParserResults {
    let results = new Types.ParserResults();
    let bracketDepth = 0; // We are searching only in the global scope
    let inComment = false;

    let lines = content.split(/\r?\n/);
    lines.forEach((lineContent, lineIndex) => {
        lineContent = lineContent.trim();
        if(lineContent.length === 0) {
            return;
        }

        const commentsResult = handleComments(lineContent, inComment);
        lineContent = commentsResult.content;
        inComment = commentsResult.inComment;
        if(lineContent.length === 0) {
            return;
        }

        let saved_bracketDepth = bracketDepth;

        bracketDepth += handleBracketDepth(lineContent);
        
        if (bracketDepth > 0) {
            // Handle local scope (no implementation yet)
            if (saved_bracketDepth !== 0 || lineContent.indexOf('{') === 0) {
                return;
            }
        }
        // Too many closing brackets, find excessive ones and report them
        if(bracketDepth < 0) {
            let contentIndex = lineContent.length - 1;
            while(contentIndex >= 0) {
                if(lineContent[contentIndex] === '}') ++bracketDepth;
                if(bracketDepth === 0) {
                    results.diagnostics.push({
                        message: 'Unmatched closing brace',
                        severity: VSCLS.DiagnosticSeverity.Error,
                        source: 'amxxpawn',
                        range: {
                            start: { line: lineIndex, character: contentIndex },
                            end: { line: lineIndex, character: contentIndex + 1 }
                        }
                    });

                    return;
                }
                --contentIndex;
            }

            bracketDepth = 0; // Try to ignore it and continue parsing
            return;
        }

        // Currently I don't really have a better way of dealing with this. Pawn allows function bodies
        // to not be enclosed in brackets given that they have only 1 statement. This will work fine if those
        // functions have only a return statement, but it will provide a callable if they don't. Let's hope
        // no one uses such code (looking at you <float.inc>).
        if(lineContent.length >= 6 && lineContent.substring(0, 6) === 'return') {
            return;
        }

        // Handle preprocessor
        if(lineContent[0] === '#') {
            // Handle #include and #tryinclude
            if(lineContent.substring(1, 8) === 'include' || lineContent.substring(1, 11) === 'tryinclude') {
                let isSilent = false;
                let startIndex = 8;
                if(lineContent.substring(1, 11) === 'tryinclude') {
                    isSilent = true;
                    startIndex = 11;
                }

                if(!StringHelpers.isWhitespace(lineContent[startIndex]) && lineContent[startIndex] !== '"' && lineContent[startIndex] !== '<') {
                    return;
                }

                let charIndex = 0;
                let termCharacter: string;
                let filename = '';
                
                lineContent = lineContent.substring(startIndex);
                while(charIndex !== lineContent.length && StringHelpers.isWhitespace(lineContent[charIndex])) { // Skip whitespace
                    ++charIndex;
                }
                if(lineContent[charIndex] === '"' || lineContent[charIndex] === '<') {
                    termCharacter = (lineContent[charIndex] === '"' ? '"' : '>');
                    ++charIndex;
                } else {
                    termCharacter = undefined; // Termination is the end of the string
                }
                // Copy the filename
                while(lineContent[charIndex] !== termCharacter && charIndex !== lineContent.length) {
                    filename += lineContent[charIndex++];
                }
                filename = filename.trim(); // Trim any surrounding whitespace
                // Verify if the terminator is correct
                if((charIndex === lineContent.length && termCharacter !== undefined) || (lineContent[charIndex] !== termCharacter)) {
                    results.diagnostics.push({
                        message: 'The #include statement is not terminated properly',
                        severity: VSCLS.DiagnosticSeverity.Error,
                        source: 'amxxpawn',
                        range: {
                            start: { line: lineIndex, character: 0 },
                            end: { line: lineIndex, character: startIndex + charIndex + 1 }
                        }
                    });

                    return;
                }
                // No more text is allowed after the terminator
                if(termCharacter !== undefined && charIndex !== lineContent.length - 1) {
                    results.diagnostics.push({
                        message: 'No extra characters are allowed after an #include statement',
                        severity: VSCLS.DiagnosticSeverity.Error,
                        source: 'amxxpawn',
                        range: {
                            start: { line: lineIndex, character: startIndex + charIndex + 1 },
                            end: { line: lineIndex, character: Number.MAX_VALUE }
                        }
                    });

                    return;
                }
                
                results.headerInclusions.push({
                    filename: filename,
                    isLocal: termCharacter !== '>',
                    isSilent: isSilent,
                    start: {
                        line: lineIndex,
                        character: 0
                    },
                    end: {
                        line: lineIndex,
                        character: startIndex + charIndex + 1
                    }
                });
            }
        } else { // Handle global scope
            if(lineContent.indexOf('(') >= 0 && lineContent.indexOf(')') >= 0) { // Could be a callable
                const matches = lineContent.match(callableRegex);
                if(!matches || matches.index !== 0) { // Has to be at line beginning
                    return;
                }

                if(matches[1] !== undefined) {
                    if(skipStatic === true && matches[1].indexOf('static') >= 0) {
                        return;
                    }
                }

                let params: VSCLS.ParameterInformation[];
                if(matches[4].trim().length > 0) {
                    params = matches[4].split(',').map((value) => ({ label: value.trim() }));
                } else {
                    params = [];
                }

                results.callables.push({
                    label: matches[0],
                    identifier: matches[3],
                    file: fileUri,
                    start: {
                        line: lineIndex,
                        character: matches.index
                    },
                    end: {
                        line: lineIndex,
                        character: matches[0].length
                    },
                    parameters: params,
                    documentaton: docComment
                });
            } else {
                let tr = readIdentifier(lineContent, 0);
                if(tr.position === lineContent.length) {
                    return;
                }

                // Some rules:
                //  - 'new' - can be only first
                //  - 'public', 'static' and 'stock' can be in place of 'new'
                //  -  can't be both 'public' and 'static'
                //  - 'const' has to be the only specifier if first
                let sr: SpecifierResults = undefined;
                switch(tr.token) {
                    case 'new':
                    case 'static':
                    case 'public':
                    case 'stock':
                    case 'const':
                        sr = readSpecicifers(lineContent, tr.position, tr.token);
                        break;
                    default: 
                        return;
                }
                if(sr.wrongCombination === true) {
                    results.diagnostics.push({
                        message: 'Invalid combination of class specifiers',
                        severity: VSCLS.DiagnosticSeverity.Error,
                        source: 'amxxpawn',
                        range: {
                            start: { line: lineIndex, character: 0 },
                            end: { line: lineIndex, character: sr.position }
                        }
                    });
                    return;
                }
                if(skipStatic && sr.isStatic) {
                    return;
                }

                // Right now I can only support a single symbol declaration unless
                // I make this really complicated. A true lexer/tokenizer is needed
                // and that may be done in the future
                // It would be ideal to check for any known symbols to report redefinition,
                // but again, a true lexer would be much better for this.
                tr = readIdentifier(lineContent, sr.position);
                if(tr.token === '') {
                    results.diagnostics.push({
                        message: 'Expected an identifier',
                        severity: VSCLS.DiagnosticSeverity.Error,
                        source: 'amxxpawn',
                        range: {
                            start: { line: lineIndex, character: sr.position },
                            end: { line: lineIndex, character: tr.position }
                        }
                    });
                    return;
                }

                let symbol = tr.token;
                let symbolTag = '';

                if(tr.position !== lineContent.length) {
                    // First try to figure out if it's a tag, and if it is read another identifier after the ':'
                    let contentIndex = tr.position;
                    // Skip whitespace
                    while(contentIndex !== lineContent.length && StringHelpers.isWhitespace(lineContent[contentIndex])) {
                        ++contentIndex;
                    }
                    if(lineContent[contentIndex] === ':') {
                        symbolTag = symbol;
                        tr = readIdentifier(lineContent, contentIndex + 1);
                        if(tr.token !== '') {
                            symbol = tr.token;
                        } else {
                            results.diagnostics.push({
                                message: 'Expected an identifier',
                                severity: VSCLS.DiagnosticSeverity.Error,
                                source: 'amxxpawn',
                                range: {
                                    start: { line: lineIndex, character: contentIndex + 1 },
                                    end: { line: lineIndex, character: tr.position }
                                }
                            });
                        }
                    }
                }

                // Let's also push everything until ',', ';', '=' or end of string
                let labelAddition = '';
                if(tr.position !== lineContent.length) {
                    let contentIndex = tr.position;
                    while(contentIndex !== lineContent.length && lineContent[contentIndex] !== ';' && lineContent[contentIndex] !== ',' && lineContent[contentIndex] !== '=') {
                        labelAddition += lineContent[contentIndex++];
                    }
                }

                results.values.push({
                    identifier: symbol,
                    label: createValueLabel(symbol, symbolTag, sr) + labelAddition,
                    isConst: sr.isConst,
                    file: fileUri,
                    range: {
                        start: { line: lineIndex, character: 0 },
                        end: { line: lineIndex, character: tr.position }
                    },
                    documentaton: docComment
                });
            }
        }
    });

    return results;
}

export function doSignatures(content: string, position: VSCLS.Position, callables: Types.CallableDescriptor[]): VSCLS.SignatureHelp {
    const cursorIndex = positionToIndex(content, position);
    const result = findFunctionIdentifier(content, cursorIndex);

    if(result.identifier === '') {
        return null;
    }

    const callableIndex = callables.map((clb) => clb.identifier).indexOf(result.identifier);
    if(callableIndex < 0) {
        return null;
    }
    const callable = callables[callableIndex];
    // No signature help if we are editing the prototype
    if(callable.start.line === position.line) {
        return null;
    }
    
    return {
        activeSignature: 0,
        activeParameter: result.parameterIndex,
        signatures: [
            {
                label: callable.label,
                parameters: callable.parameters,
                documentation: callable.documentaton
            }
        ]
    };
}

export function doCompletions(
    content: string,
    position: VSCLS.Position,
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): VSCLS.CompletionItem[] {

    const cursorIndex = positionToIndex(content, position);
    const identifier = findIdentifierBehindCursor(content, cursorIndex).toLowerCase();
        
    let callables: Types.CallableDescriptor[];
    let values: Types.ValueDescriptor[];
    if(identifier.length === 0) { // Don't allow empty query
        return null;
    } else {
        const results = Helpers.getSymbols(data, dependenciesData);
        values = results.values.filter((val) => StringHelpers.fuzzy(val.identifier, identifier));
        callables = results.callables.filter((clb) => StringHelpers.fuzzy(clb.identifier, identifier));
    }
    
    // '21 as VSCLS.CompletionItemKind'
    // - At the time of writing LSP doesn't include new item kinds that VSC does
    // 21 is 'Constant'
    return values.map<VSCLS.CompletionItem>((val) => ({
        label: val.identifier,
        detail: val.label,
        kind: val.isConst ? 21 as VSCLS.CompletionItemKind : VSCLS.CompletionItemKind.Variable,
        insertText: val.identifier[0] === '@' ? val.identifier.substr(1) : val.identifier,
        documentation: val.documentaton
    }))
    .concat(callables.map<VSCLS.CompletionItem>((clb) => ({
        label: clb.identifier,
        detail: clb.label,
        kind: VSCLS.CompletionItemKind.Function,
        insertText: clb.identifier[0] === '@' ? clb.identifier.substr(1) : clb.identifier,
        documentation: clb.documentaton
    })));
}

export function doHover(
    content: string,
    position: VSCLS.Position,
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): VSCLS.Hover {

    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);

    if(result.identifier.length === 0) {
        return null;
    }

    const symbols = Helpers.getSymbols(data, dependenciesData);
    if(result.isCallable) {
        const index = symbols.callables.map((clb) => clb.identifier).indexOf(result.identifier);
        if(index < 0) {
            return null;
        }
        const callable = symbols.callables[index];
        if(position.line === callable.start.line) {
            return null;
        }

        return {
            contents: [
                {
                    language: 'amxxpawn',
                    value: callable.label
                },
                {
                    language: 'pawndoc',
                    value: callable.documentaton
                }
            ]
        };
    } else {
        const index = symbols.values.map((val) => val.identifier).indexOf(result.identifier);
        if(index < 0) {
            return null;
        }
        const value = symbols.values[index];
        if(position.line === value.range.start.line) {
            return null;
        }

        return {
            contents: [
                {
                    language: 'amxxpawn',
                    value: value.label
                },
                {
                    language: 'pawndoc',
                    value: value.documentaton
                }
            ]
        };
    }
}

export function doDefinition(
    content: string,
    position: VSCLS.Position,
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): VSCLS.Location {

    const cursorIndex = positionToIndex(content, position);
    const result = findIdentifierAtCursor(content, cursorIndex);

    if(result.identifier.length === 0) {
        return null;
    }

    const symbols = Helpers.getSymbols(data, dependenciesData);
    if(result.isCallable) {
        const index = symbols.callables.map((clb) => clb.identifier).indexOf(result.identifier);
        if(index < 0) {
            return null;
        }
        const callable = symbols.callables[index];

        return VSCLS.Location.create(callable.file.toString(), VSCLS.Range.create(callable.start, callable.end));
    } else {
        const index = symbols.values.map((val) => val.identifier).indexOf(result.identifier);
        if(index < 0) {
            return null;
        }
        const value = symbols.values[index];
        if(position.line === value.range.start.line) {
            return null;
        }

        return VSCLS.Location.create(value.file.toString(), value.range);
    }
}
