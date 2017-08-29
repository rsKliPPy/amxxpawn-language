'use strict';

import * as FS from 'fs';
import * as Path from 'path';
import * as CP from 'child_process';
import * as VSC from 'vscode';
import * as Settings from '../common/settings-types';
import * as Helpers from '../common/helpers';


function doCompile(executablePath: string, inputPath: string, compilerSettings: Settings.CompilerSettings, outputChannel: VSC.OutputChannel) {
    let outputPath = '';
    if(compilerSettings.outputType === 'path') {
        outputPath = Helpers.resolvePathVariables(compilerSettings.outputPath, VSC.workspace.rootPath, inputPath) 
        if(!FS.existsSync(outputPath)) {
            outputChannel.appendLine(`Path ${outputPath} doesn't exist. Compilation aborted.`);
            return;
        }
        outputPath = Path.join(outputPath, Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
    } else if(compilerSettings.outputType === 'source') {
        outputPath = Path.join(Path.dirname(inputPath), Path.basename(inputPath, Path.extname(inputPath)) + '.amxx');
    } else if(compilerSettings.outputType === 'plugins') {
        // Unfinished
    } else {
        outputChannel.appendLine('\'amxxpc.compiler.outputType\' setting has an invalid value.');
        return;
    }

    const compilerArgs: string[] = [
        inputPath,
        ...compilerSettings.options,
        ...compilerSettings.includePaths.map((path) => `-i${Helpers.resolvePathVariables(path, VSC.workspace.rootPath, inputPath)}`),
        `-o${outputPath}`
    ];
    const spawnOptions: CP.SpawnOptions = {
        env: process.env,
        cwd: Path.dirname(executablePath)
    };

    outputChannel.appendLine(`Starting amxxpc: ${executablePath} ${compilerArgs.join(' ')}\n`);

    const amxxpcProcess = CP.spawn(executablePath, compilerArgs, spawnOptions);
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
}

export function compile(outputChannel: VSC.OutputChannel) {
    outputChannel.clear();
    outputChannel.show();

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
    const executablePath = Helpers.resolvePathVariables(compilerSettings.executablePath, VSC.workspace.rootPath, inputPath);

    FS.access(executablePath, FS.constants.X_OK, (err) => {
        if(err) {
            outputChannel.appendLine('Can\'t access amxxpc. Please check if the path is correct and if you have permissions to execute amxxpc.');
            return;
        }
        
        doCompile(executablePath, inputPath, compilerSettings, outputChannel);
    });
}

export function compileLocal(outputChannel: VSC.OutputChannel) {
    outputChannel.clear();
    outputChannel.show();

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
    const executableDir = Path.dirname(inputPath);
    FS.readdir(executableDir, (err, files) => {
        if(err) {
            throw err;
        }

        const potentialFiles = files.filter((file) => file.substring(0, 6) === 'amxxpc');
        let executablePath: string;

        // Check specifically for 'amxxpc.exe', resulting in no ambiguity
        const amxxpcExeIndex = potentialFiles.indexOf('amxxpc.exe');
        if(amxxpcExeIndex >= 0) {
            executablePath = Path.join(executableDir, potentialFiles[amxxpcExeIndex]);
        } else {
            if(potentialFiles.length === 0) {
                outputChannel.appendLine(`There are no files starting with 'amxxpc' in '${executableDir}'. Failed detecting amxxpc executable.`);
                return;
            }
            if(potentialFiles.length > 1) {
                outputChannel.appendLine(`Ambiguous result: there is more than 1 file in '${executableDir}' starting with 'amxxpc'. Failed detecting amxxpc executable.`);
                return;
            }
            executablePath = Path.join(executableDir, potentialFiles[0]);
        }

        FS.access(executablePath, FS.constants.X_OK, (err) => {
            if(err) {
                outputChannel.appendLine('Can\'t access amxxpc. Please check if you have permissions to execute amxxpc.');
                return;
            }
            
            doCompile(Path.join(executableDir, potentialFiles[0]), inputPath, compilerSettings, outputChannel);
        });
    });
}