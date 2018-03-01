'use strict';

import * as VSCLS from 'vscode-languageserver';
import * as DM from './dependency-manager';
import Uri from 'vscode-uri';

export interface InclusionDescriptor {
    // The included filename
    filename: string;

    // This dependency has been included with '#include filename' or '#include "filename"'
    isLocal: boolean;

    // This dependency has been included with '#tryinclude'
    isSilent: boolean;

    // Where in the file is the #include statement
    start: VSCLS.Position;
    end: VSCLS.Position;
};

export interface ResolvedInclusion {
    descriptor: InclusionDescriptor;
    uri: string;
};

export interface CallableDescriptor {
    // Prototype
    label: string;

    // Identifier (without storage specifiers and parameters)
    identifier: string;

    // Where in the file is the callable defined
    // TODO: Make this VSCLS.Location
    file: Uri;
    start: VSCLS.Position;
    end: VSCLS.Position;

    // Parameter informations
    parameters: VSCLS.ParameterInformation[];

    documentaton: string;
};

// Awfully bad name but will do. Neither "Variable" nor "Constant" would be
// good enough, but "Symbol" and "Identifier" are too broad
export interface ValueDescriptor {
    // Prototype
    label: string;
    
    // Identifier (without storage specifiers and parameters)
    identifier: string;

    // Is constant?
    isConst: boolean;

    // Where is it defined
    // TODO: Make this VSCLS.Locaton
    file: Uri;
    range: VSCLS.Range;

    documentaton: string;
}

export class ParserResults {
    public headerInclusions: InclusionDescriptor[];
    public callables: CallableDescriptor[];
    public values: ValueDescriptor[];
    public diagnostics: VSCLS.Diagnostic[];

    public constructor() {
        this.headerInclusions = [];
        this.callables = [];
        this.values = [];
        this.diagnostics = [];
    }
};

export class DocumentData {
    public uri: string;
    public reparseTimer: NodeJS.Timer;
    public resolvedInclusions: ResolvedInclusion[];
    public callables: CallableDescriptor[];
    public values: ValueDescriptor[];
    public dependencies: DM.FileDependency[];

    constructor(uri: string) {
        this.uri = uri;
        this.reparseTimer = null; 
        this.resolvedInclusions = [];
        this.callables = [];
        this.values = [];
        this.dependencies = [];
    }
};
