'use strict';

import * as Path from 'path';
import * as VSC from 'vscode';
import * as VSCLC from 'vscode-languageclient';
import * as Commands from './commands';

let diagnosticCollection: VSC.DiagnosticCollection;


export function activate(ctx: VSC.ExtensionContext) {
    const serverModulePath = ctx.asAbsolutePath(Path.join('build', 'server', 'server.js'));
    const debugOptions = { execArgv: ["--nolazy", "--debug=5858"] };

    const serverOptions: VSCLC.ServerOptions = {
        run: {
            module: serverModulePath,
            transport: VSCLC.TransportKind.ipc,
            options: debugOptions
        },
        debug: {
            module: serverModulePath,
            transport: VSCLC.TransportKind.ipc,
            options: debugOptions
        }
    };

    const clientOptions: VSCLC.LanguageClientOptions = {
        documentSelector: [ 'amxxpawn' ],
        synchronize: {
            configurationSection: [
                'amxxpawn.language',
                'amxxpawn.compiler'
            ],
            fileEvents: VSC.workspace.createFileSystemWatcher('**/*.*')
        }
    };

    const languageClient = new VSCLC.LanguageClient('amxxpawn', 'AMXXPawn Language Service', serverOptions, clientOptions);

    const outputChannel = VSC.window.createOutputChannel('AMXXPC Output / AMXXPawn');

    diagnosticCollection = VSC.languages.createDiagnosticCollection('amxxpawn');
    
    const commandCompile = VSC.commands.registerCommand('amxxpawn.compile', Commands.compile.bind(null, outputChannel, diagnosticCollection));
    const commandCompileLocal = VSC.commands.registerCommand('amxxpawn.compileLocal', Commands.compileLocal.bind(null, outputChannel, diagnosticCollection));

    VSC.workspace.onDidChangeTextDocument(onDidChangeTextDocument);
    
    // Push all disposables
    ctx.subscriptions.push(
        languageClient.start(),

        diagnosticCollection,

        // Commands
        commandCompile,
        commandCompileLocal,
        
        // Output channels
        VSC.Disposable.from(outputChannel)
    );
}

function onDidChangeTextDocument(ev: VSC.TextDocumentChangeEvent) {
    diagnosticCollection.delete(ev.document.uri);
}

export function deactivate() {

}