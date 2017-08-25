'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import * as VSCLS from 'vscode-languageserver';
import Uri from 'vscode-uri';
import * as Settings from '../common/settings-types'; 
import * as Parser from './parser';
import * as Types from './types';
import * as DepMng from './dependency-manager';
import * as Helpers from './helpers';
import {amxxDefaultHeaders} from './amxx-default-headers';

let syncedSettings: Settings.SyncedSettings;
let dependencyManager: DepMng.FileDependencyManager = new DepMng.FileDependencyManager();
let documentsData: WeakMap<VSCLS.TextDocument, Types.DocumentData> = new WeakMap();
let dependenciesData: WeakMap<DepMng.FileDependency, Types.DocumentData> = new WeakMap();

/**
 * In future switch to incremental sync
 */
const connection = VSCLS.createConnection(new VSCLS.IPCMessageReader(process), new VSCLS.IPCMessageWriter(process));
const documentsManager = new VSCLS.TextDocuments();

documentsManager.listen(connection);
connection.listen();

connection.onInitialize((params) => {  
    return {
        capabilities: {
            textDocumentSync: documentsManager.syncKind,
            documentLinkProvider: {
               resolveProvider: false 
            },
            definitionProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['(', ',']
            }
        }
    };
});

connection.onDocumentLinks((params) => {
    function inclusionsToLinks(inclusions: Types.InclusionDescriptor[]): VSCLS.DocumentLink[] {
        const links: VSCLS.DocumentLink[] = [];

        inclusions.forEach((inclusion) => {
            if(amxxDefaultHeaders.indexOf(inclusion.headerName) >= 0) {
                links.push({
                    target: `https://amxmodx.org/api/${inclusion.headerName}`,
                    range: {
                        start: inclusion.start,
                        end: inclusion.end
                    }
                });
            }
        });

        return links;
    }

    const data = documentsData.get(documentsManager.get(params.textDocument.uri));

    return inclusionsToLinks(data.resolvedInclusions.map((inclusion) => inclusion.descriptor));
});

connection.onDidChangeConfiguration((params) => {
    syncedSettings = params.settings.amxxpawn as Settings.SyncedSettings;
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
    return Parser.doSignatures(document.getText(), params.position, Helpers.getCallables(data, dependenciesData));
});

documentsManager.onDidOpen((ev) => {
    let data = new Types.DocumentData(ev.document.uri);
    documentsData.set(ev.document, data);
    reparseDocument(ev.document);
});

documentsManager.onDidClose((ev) => {
    documentsData.delete(ev.document);
});

documentsManager.onDidChangeContent((ev) => {
    let data = documentsData.get(ev.document);

    if(data.reparseTimer === null) {
        data.reparseTimer = setTimeout(reparseDocument, syncedSettings.language.reparseInterval, ev.document);
    }
});


function resolveIncludePath(header: string): string {
    for(const includePath of syncedSettings.compiler.includePaths) {
        const path = Path.join(includePath, header + '.inc');

        try {
            FS.accessSync(path, FS.constants.R_OK);
            return Uri.file(path).toString();
        } catch(err) {
            continue;
        }
    }

    return '';
}

// Should probably move this to 'parser.ts'
function parseFile(content: string, data: Types.DocumentData, diagnostics: Map<string, VSCLS.Diagnostic[]>, isDependency: boolean) {
    const results = Parser.parse(content, isDependency);
    // We are going to list all dependencies here first before we add them to data.dependencies
    // so we can check if any previous dependencies have been removed.
    const dependencies: DepMng.FileDependency[] = [];
    data.resolvedInclusions = [];

    results.headerInclusions.forEach((header) => {
        const resolvedUri = resolveIncludePath(header.headerName);
        if(resolvedUri === data.uri) {
            return;
        }

        if(resolvedUri !== '') { // File exists
            let dependency = dependencyManager.getDependency(resolvedUri);
            if(dependency === undefined) {
                // No other files depend on the included one
                dependency = dependencyManager.addDependency(resolvedUri);
            } else if(data.dependencies.indexOf(dependency) < 0) {
                // The included file already has data, but the parsed file didn't depend on it before
                dependencyManager.addDependency(dependency.uri);
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
            let myDiagnostics = diagnostics.get(data.uri);
            if(myDiagnostics === undefined) { // There have been no diagnostics for this file yet
                myDiagnostics = [];
                diagnostics.set(data.uri, myDiagnostics);
            }
            myDiagnostics.push({
                message: `Couldn't resolve include path '${header.headerName}'. Check compiler include paths.`,
                severity: VSCLS.DiagnosticSeverity.Error,
                source: 'amxxpawn',
                range: {
                    start: header.start,
                    end: header.end
                }
            });
        }
    });

    // Remove all dependencies that have been previously removed from the parsed document
    // TODO: Walk the dependency tree and properly do this, right now it only removes from
    // the first level
    data.dependencies
        .filter((dep) => dependencies.indexOf(dep) < 0)
        .forEach((dep) => dependencyManager.removeDependency(dep.uri));

    data.dependencies = dependencies;
    data.callables = results.callables;
}

function reparseDocument(document: VSCLS.TextDocument) {
    const data = documentsData.get(document);
    if(data === undefined) {
        return;
    }
    data.reparseTimer = null;

    const diagnostics: Map<string, VSCLS.Diagnostic[]> = new Map();

    parseFile(document.getText(), data, diagnostics, false);
    diagnostics.forEach((ds, uri) => connection.sendDiagnostics({ uri: uri, diagnostics: ds }));
}