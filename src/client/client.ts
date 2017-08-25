'use strict';

import * as Path from 'path';
import * as VSC from 'vscode';
import * as VSCLC from 'vscode-languageclient';
import * as Commands from './commands';


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
            fileEvents: VSC.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    const languageClient = new VSCLC.LanguageClient('amxxpawn', 'AMXXPawn Language Service', serverOptions, clientOptions);

    const outputChannel = VSC.window.createOutputChannel('AMXXPC Output / AMXXPawn');
    
    const commandCompile = VSC.commands.registerCommand('amxxpawn.compile', Commands.compile.bind(null, outputChannel));
    const commandRunHalfLife = VSC.commands.registerCommand('amxxpawn.runHalfLife', Commands.runHalfLife.bind(null, outputChannel));

    // Push all disposables
    ctx.subscriptions.push(
        languageClient.start(),

        // Commands
        commandCompile,
        commandRunHalfLife,
        
        // Output channels
        VSC.Disposable.from(outputChannel)
    );
}

export function deactivate() {

}