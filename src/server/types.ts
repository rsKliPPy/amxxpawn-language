'use strict';

import * as VSCLS from 'vscode-languageserver';
import * as DM from './dependency-manager';

export interface InclusionDescriptor {
    // The included filename
    headerName: string;

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
    start: VSCLS.Position;
    end: VSCLS.Position;

    // Parameter informations
    parameters: VSCLS.ParameterInformation[];
};

export class ParserResults {
    public headerInclusions: InclusionDescriptor[];
    public callables: CallableDescriptor[];

    public constructor() {
        this.headerInclusions = [];
        this.callables = [];
    }
};

export class DocumentData {
    public uri: string;
    public reparseTimer: NodeJS.Timer;
    public resolvedInclusions: ResolvedInclusion[];
    public callables: CallableDescriptor[];
    public dependencies: DM.FileDependency[];

    constructor(uri: string) {
        this.uri = uri;
        this.reparseTimer = null; 
        this.resolvedInclusions = [];
        this.callables = [];
        this.dependencies = [];
    }
};