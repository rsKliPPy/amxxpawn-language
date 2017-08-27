import * as Path from 'path';
import Uri from 'vscode-uri';


function substituteVariable(variable: string, workspacePath: string, filePath: string) {
    switch(variable) {
        case 'workspaceRoot': return workspacePath !== undefined ? workspacePath : '';
        case 'workspaceRootFolderName': return workspacePath !== undefined ? Path.basename(workspacePath) : '';
        case 'file': return filePath;
        case 'relativeFile': return Path.relative(workspacePath, filePath);
        case 'fileBasename': return Path.basename(filePath);
        case 'fileBasenameNoExtension':
            const extIndex = filePath.lastIndexOf('.');
            if(extIndex > 0) {
                return Path.basename(filePath.substring(0, extIndex));
            }
            return Path.basename(filePath);
        case 'fileDirname': return Path.dirname(filePath);
        case 'fileExtname': return Path.extname(filePath);
        default: return undefined;
    }
}

export function resolvePathVariables(path: string, workspacePath: string, filePath: string) {

    let index = 0;
    let finalPath = '';

    while(index !== path.length) {
        if(path[index] === '$' && path[index + 1] === '{') {
            const startIndex = index;
            index += 2;

            while(index !== path.length && path[index] !== '}') {
                ++index;
            }
            if(index === path.length) { // Reached the end, just copy and return
                return finalPath + path.substring(startIndex);
            }

            const substitution = substituteVariable(path.substring(startIndex + 2, index).trim(), workspacePath, filePath);
            if(substitution === undefined) {
                finalPath += path.substring(startIndex, ++index);
                continue;
            } else {
                finalPath += substitution;
                ++index;
                continue;
            }
        } else {
            finalPath += path[index++];
            continue;
        }
    }

    return finalPath;
}