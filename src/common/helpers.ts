import * as Path from 'path';
import Uri from 'vscode-uri';


function substituteVariables(variable: string, workspacePath: string, filePath: string) {
    switch(variable) {
        case 'workspaceRoot': return workspacePath;
        case 'workspaceRootFolderName': return workspacePath !== undefined ? Path.basename(workspacePath) : undefined;
        case 'file': return filePath;
        case 'relativeFile': return filePath !== undefined ? Path.relative(workspacePath, filePath) : undefined;
        case 'fileBasename': return filePath !== undefined ? Path.basename(filePath) : undefined;
        case 'fileBasenameNoExtension':
            if(filePath === undefined) return undefined;

            const extIndex = filePath.lastIndexOf('.');
            if(extIndex > 0) {
                return Path.basename(filePath.substring(0, extIndex));
            }
            return Path.basename(filePath);
        case 'fileDirname': return filePath !== undefined ? Path.dirname(filePath) : undefined;
        case 'fileExtname': return filePath !== undefined ? Path.extname(filePath) : undefined;
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

            const substitution = substituteVariables(path.substring(startIndex + 2, index).trim(), workspacePath, filePath);
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
