'use strict';

import * as VSCLS from 'vscode-languageserver';
import * as StringHelpers from '../common/string-helpers';
import * as Types from './types';

interface FindFunctionIdentifierResult {
    identifier: string,
    parameterIndex?: number;
};

const includeRegex = /\#include\s*\<\s*(\w+)\s*\>/;

// 1 = storage specifiers
// 2 = tag
// 3 = identifier
// 4 = parameters
const callableRegex = /([\w\s]+?)?([A-Za-z_@][\w_@]+\s*:\s*)?\b([A-Za-z_@][\w_@]+)\s*\((.*?)\)/;


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
    let parsingIdentifier = false;
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

export function parse(content: string, skipStatic: boolean): Types.ParserResults {
    let results = new Types.ParserResults();
    let bracketDepth = 0; // We are searching only in the global scope
    let bracketIndex: number;
    let commentIndex: number;
    let foundMultilineComment = false;
    let inComment = false;

    let lines = content.split(/\r?\n/);
    lines.forEach((lineContent, lineIndex) => {
        lineContent = lineContent.trim();
        if(lineContent.length === 0) {
            return;
        }

        // Handle comments
        if(inComment === true && (commentIndex = lineContent.indexOf('*/')) >= 0) {
            lineContent = lineContent.substring(commentIndex + 2).trim();
            inComment = false;
            if(lineContent.length === 0) {
                return;
            }
        }
        if(inComment === true) {
            return;
        }

        commentIndex = lineContent.indexOf('/*');
        if(commentIndex >= 0) {
            let endCommentIndex = lineContent.indexOf('*/')
            if(endCommentIndex >= 0) {
                lineContent = (lineContent.substring(0, commentIndex) + lineContent.substring(endCommentIndex + 2)).trim();
            } else {
                lineContent = lineContent.substring(0, commentIndex).trim();
                inComment = true;
            }
            if(lineContent.length === 0) {
                return;
            }
            foundMultilineComment = true;
        }

        commentIndex = lineContent.indexOf('//');
        if(commentIndex >= 0) {
            lineContent = lineContent.substring(0, commentIndex).trim();
            if(lineContent.length === 0) {
                return;
            }
        }

        // Handle brackets, we are only parsing the global namespace
        bracketIndex = lineContent.indexOf('}');
        if(bracketIndex >= 0) {
            --bracketDepth;
            // Handle closing and opening brackets on the same line
            // This should be done recursively in case there is more than
            // one '} {' pair.
            if(lineContent.substring(bracketIndex + 1).indexOf('{') >= 0) {
                ++bracketDepth;
                return;
            } else if(bracketIndex === 0) {
                return;
            }
        }
        bracketIndex = lineContent.indexOf('{');
        if(bracketIndex >= 0) {
            ++bracketDepth;
            if(bracketIndex === 0) {
                return;
            }
        }
        if(bracketDepth > 0) {
            return;
        }

        // Currently I don't really have a better way of dealing with this. Pawn allows function bodies
        // to not be enclosed in brackets given that they have only 1 statement. This will work fine if those
        // functions have only a return statement, but it will provide a callable if they don't. Let's hope
        // no one uses such code (looking at you <float.inc>).
        if(lineContent.length >= 6 && lineContent.substring(0, 6) === 'return') {
            return;
        }

        if(lineContent[0] === '#') {
            if(lineContent.substring(1, 8) === 'include') {
                const matches = lineContent.match(includeRegex);
                if(!matches) {
                    return;
                }
    
                results.headerInclusions.push({
                    headerName: matches[1],
                    start: {
                        line: lineIndex,
                        character: 0
                    },
                    end: {
                        line: lineIndex,
                        character: matches[0].length
                    }
                });
            }
        }
        else {
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
                    start: {
                        line: lineIndex,
                        character: matches.index
                    },
                    end: {
                        line: lineIndex,
                        character: matches[0].length
                    },
                    parameters: params
                });
            }
        }

        if(foundMultilineComment === true) {
            foundMultilineComment = false;
            inComment = true;
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
                parameters: callable.parameters
            }
        ]
    };
}