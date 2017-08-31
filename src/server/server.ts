'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import * as VSCLS from 'vscode-languageserver';
import Uri from 'vscode-uri';
import * as Settings from '../common/settings-types'; 
import * as Parser from './parser';
import * as Types from './types';
import * as DM from './dependency-manager';
import * as Helpers from './helpers';
import {resolvePathVariables} from '../common/helpers';
import {amxxDefaultHeaders} from './amxx-default-headers';

let syncedSettings: Settings.SyncedSettings;
let dependencyManager: DM.FileDependencyManager = new DM.FileDependencyManager();
let documentsData: WeakMap<VSCLS.TextDocument, Types.DocumentData> = new WeakMap();
let dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData> = new WeakMap();
let workspaceRoot: string = '';

/**
 * In future switch to incremental sync
 */
const connection = VSCLS.createConnection(new VSCLS.IPCMessageReader(process), new VSCLS.IPCMessageWriter(process));
const documentsManager = new VSCLS.TextDocuments();

documentsManager.listen(connection);
connection.listen();

connection.onInitialize((params) => {
    workspaceRoot = params.rootUri;

    return {
        capabilities: {
            textDocumentSync: documentsManager.syncKind,
            documentLinkProvider: {
               resolveProvider: false 
            },
            definitionProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['(', ',']
            },
            documentSymbolProvider: true,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['(', ',', '=']
            },
            hoverProvider: true
        }
    };
});

connection.onDocumentLinks((params) => {
    function inclusionsToLinks(inclusions: Types.InclusionDescriptor[]): VSCLS.DocumentLink[] {
        const links: VSCLS.DocumentLink[] = [];

        inclusions.forEach((inclusion) => {
            let filename = inclusion.filename;
            if(filename.substring(filename.length - 4) === '.inc') { // Remove .inc before checking
                filename = filename.substring(0, filename.length - 4);
            }
            if(amxxDefaultHeaders.indexOf(filename) >= 0) {
                links.push({
                    target: `https://amxmodx.org/api/${filename}`,
                    range: {
                        start: inclusion.start,
                        end: inclusion.end
                    }
                });
            }
        });

        return links;
    }

    if(syncedSettings.language.webApiLinks === true) {
        const data = documentsData.get(documentsManager.get(params.textDocument.uri));
        
        return inclusionsToLinks(data.resolvedInclusions.map((inclusion) => inclusion.descriptor));
    }
    
    return null;
});

connection.onDidChangeConfiguration((params) => {
    const workspacePath = Uri.parse(workspaceRoot).fsPath;
    syncedSettings = params.settings.amxxpawn as Settings.SyncedSettings;
    syncedSettings.compiler.includePaths = syncedSettings.compiler.includePaths.map((path) => resolvePathVariables(path, workspacePath, undefined));

    documentsManager.all().forEach(reparseDocument);
});

connection.onDefinition((params) => {
    function inclusionLocation(inclusions: Types.ResolvedInclusion[]): VSCLS.Location {
        for(const inc of inclusions) {
            if( params.position.line === inc.descriptor.start.line
                && params.position.character > inc.descriptor.start.character
                && params.position.character < inc.descriptor.end.character
            ) {
                return VSCLS.Location.create(inc.uri, {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 1 }
                });
            }
        }

        return null;
    };

    const document = documentsManager.get(params.textDocument.uri);
    if(document === undefined) {
        return null;
    }

    const data = documentsData.get(document);
    return inclusionLocation(data.resolvedInclusions);
});

connection.onSignatureHelp((params) => {
    const document = documentsManager.get(params.textDocument.uri);
    if(document === undefined) {
        return null;
    }

    const data = documentsData.get(document);
    return Parser.doSignatures(document.getText(), params.position, Helpers.getSymbols(data, dependenciesData).callables);
});

connection.onDocumentSymbol((params) => {
    const data = documentsData.get(documentsManager.get(params.textDocument.uri));

    const symbols: VSCLS.SymbolInformation[] = data.callables.map<VSCLS.SymbolInformation>((clb) => ({
        name: clb.identifier,
        location: {
            range: {
                start: clb.start,
                end: clb.end
            },
            uri: params.textDocument.uri
        },
        kind: VSCLS.SymbolKind.Function
    }));

    return symbols;
});

connection.onCompletion((params) => {
    const document = documentsManager.get(params.textDocument.uri);
    if(document === undefined) {
        return null;
    }

    const data = documentsData.get(document);
    return {
        isIncomplete: true,
        items: Parser.doCompletions(document.getText(), params.position, data, dependenciesData)
    };
});

connection.onHover((params) => {
    const document = documentsManager.get(params.textDocument.uri);
    if(document === undefined) {
        return null;
    }

    const data = documentsData.get(document);
    return Parser.doHover(document.getText(), params.position, data, dependenciesData);
});

documentsManager.onDidOpen((ev) => {
    let data = new Types.DocumentData(ev.document.uri);
    documentsData.set(ev.document, data);
    reparseDocument(ev.document);
});

documentsManager.onDidClose((ev) => {
    Helpers.removeDependencies(documentsData.get(ev.document).dependencies, dependencyManager, dependenciesData);
    Helpers.removeUnreachableDependencies(documentsManager.all().map((doc) => documentsData.get(doc)), dependencyManager, dependenciesData);
    documentsData.delete(ev.document);
});

documentsManager.onDidChangeContent((ev) => {
    let data = documentsData.get(ev.document);

    if(data.reparseTimer === null) {
        data.reparseTimer = setTimeout(reparseDocument, syncedSettings.language.reparseInterval, ev.document);
    }
});


function resolveIncludePath(filename: string, localTo: string): string {
    const includePaths = [...syncedSettings.compiler.includePaths];
    // If should check the local path, check it first
    if(localTo !== undefined) {
        includePaths.unshift(localTo);
    }

    for(const includePath of syncedSettings.compiler.includePaths) {
        let path = Path.join(includePath, filename);

        try {
            FS.accessSync(path, FS.constants.R_OK);
            return Uri.file(path).toString();
        } catch(err) {
            // Append .inc and try again
            // amxxpc actually tries to append .p and .pawn in addition to .inc, but nobody uses those
            try {
                path += '.inc';
                FS.accessSync(path, FS.constants.R_OK);
                return Uri.file(path).toString();
            } catch(err) {
                continue;
            }
        }
    }

    return undefined;
}

// Should probably move this to 'parser.ts'
function parseFile(content: string, data: Types.DocumentData, diagnostics: Map<string, VSCLS.Diagnostic[]>, isDependency: boolean) {
    let myDiagnostics = [];
    diagnostics.set(data.uri, myDiagnostics);
    // We are going to list all dependencies here first before we add them to data.dependencies
    // so we can check if any previous dependencies have been removed.
    const dependencies: DM.FileDependency[] = [];

    const results = Parser.parse(content, isDependency);
    
    data.resolvedInclusions = [];
    myDiagnostics.push(...results.diagnostics);

    results.headerInclusions.forEach((header) => {
        const resolvedUri = resolveIncludePath(header.filename, header.isLocal ? Path.dirname(Uri.parse(data.uri).fsPath) : undefined);
        if(resolvedUri === data.uri) {
            return;
        }

        if(resolvedUri !== undefined) { // File exists
            let dependency = dependencyManager.getDependency(resolvedUri);
            if(dependency === undefined) {
                // No other files depend on the included one
                dependency = dependencyManager.addReference(resolvedUri);
            } else if(data.dependencies.indexOf(dependency) < 0) {
                // The included file already has data, but the parsed file didn't depend on it before
                dependencyManager.addReference(dependency.uri);
            }
            dependencies.push(dependency);

            let depData = dependenciesData.get(dependency);
            if(depData === undefined) { // The dependency file has no data yet
                depData = new Types.DocumentData(dependency.uri);
                dependenciesData.set(dependency, depData);
                
                // This should probably be made asynchronous in the future as it probably
                // blocks the event loop for a considerable amount of time.
                const content = FS.readFileSync(Uri.parse(dependency.uri).fsPath).toString();
                parseFile(content, depData, diagnostics, true);
            }

            data.resolvedInclusions.push({
                uri: resolvedUri,
                descriptor: header
            });
        } else {
            myDiagnostics.push({
                message: `Couldn't resolve include path '${header.filename}'. Check compiler include paths.`,
                severity: header.isSilent ? VSCLS.DiagnosticSeverity.Information : VSCLS.DiagnosticSeverity.Error,
                source: 'amxxpawn',
                range: {
                    start: header.start,
                    end: header.end
                }
            });
        }
    });

    // Remove all dependencies that have been previously removed from the parsed document
    Helpers.removeDependencies(data.dependencies.filter((dep) => dependencies.indexOf(dep) < 0), dependencyManager, dependenciesData);
    data.dependencies = dependencies;

    data.callables = results.callables;
    data.values = results.values;
}

function reparseDocument(document: VSCLS.TextDocument) {
    const data = documentsData.get(document);
    if(data === undefined) {
        return;
    }
    data.reparseTimer = null;

    const diagnostics: Map<string, VSCLS.Diagnostic[]> = new Map();

    parseFile(document.getText(), data, diagnostics, false);
    // Find and remove any dangling nodes in the dependency graph
    Helpers.removeUnreachableDependencies(documentsManager.all().map((doc) => documentsData.get(doc)), dependencyManager, dependenciesData);
    diagnostics.forEach((ds, uri) => connection.sendDiagnostics({ uri: uri, diagnostics: ds }));
}