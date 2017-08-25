'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import * as CP from 'child_process';
import * as VSC from 'vscode';
import * as Settings from '../common/settings-types';


export function compile(outputChannel: VSC.OutputChannel) {
    outputChannel.clear();

    const editor = VSC.window.activeTextEditor;
    if(editor === undefined) {
        outputChannel.appendLine('No active window with Pawn code.');
        return;
    }
    if(editor.document.uri.scheme !== 'file') {
        outputChannel.appendLine('The input file is not a file on the disk.');
        return;
    }
    const inputPath = editor.document.uri.fsPath;

    const compilerSettings = VSC.workspace.getConfiguration('amxxpawn').get('compiler') as Settings.CompilerSettings;

    FS.access(compilerSettings.executablePath, FS.constants.X_OK, (err) => {
        if(err) {
            outputChannel.show();
            outputChannel.appendLine('Can\'t access amxxpc. Please check if the path is correct and if you have permissions to execute amxxpc.');
            return;
        }

        let outputPath = '';
        if(compilerSettings.outputType === 'path') {
            outputPath = Path.join(compilerSettings.outputPath, Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
        } else if(compilerSettings.outputType === 'source') {
            outputPath = Path.join(Path.dirname(inputPath), Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
        } else if(compilerSettings.outputType === 'plugins') {
            // Unfinished
        } else {
            outputChannel.appendLine('\'amxxpc.compiler.outputType\' setting has an invalid value.');
            return;
        }

        let compilerArgs: string[] = [
            inputPath,
            ...compilerSettings.options,
            ...compilerSettings.includePaths.map((path) => `-i${path}`),
            `-o${outputPath}`
        ];
        const spawnOptions: CP.SpawnOptions = {
            env: process.env
        };

        const amxxpcProcess = CP.spawn(compilerSettings.executablePath, compilerArgs, spawnOptions);
        amxxpcProcess.stdout.on('data', (data) => {
            const textData = (data instanceof Buffer) ? data.toString() : data as string;
            outputChannel.append(textData);
        });
        amxxpcProcess.stderr.on('data', (data) => {
            const textData = (data instanceof Buffer) ? data.toString() : data as string;
            outputChannel.append('amxxpc stderr: ' + data as string);
        });
        amxxpcProcess.on('error', (err) => {
            outputChannel.appendLine(`Failed to start amxxpc: ${err.message}`);
        });
        amxxpcProcess.on('close', (exitCode) => {
            outputChannel.appendLine(`\namxxpc exited with code ${exitCode}.`);
        });
    });
}

export function runHalfLife(outputChannel: VSC.OutputChannel) {
    const compilerSettings = VSC.workspace.getConfiguration('amxxpawn').get('compiler') as Settings.CompilerSettings;
    console.log('Unfinished feature :(');
}