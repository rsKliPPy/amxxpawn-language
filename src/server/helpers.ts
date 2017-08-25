'use strict';

import * as Types from './types';
import * as DepMng from './dependency-manager';

type CallablesWithLocationResults = Map<string, Types.CallableDescriptor[]>;

function getCallablesImpl(data: Types.DocumentData, dependenciesData: WeakMap<DepMng.FileDependency, Types.DocumentData>, visited: Map<DepMng.FileDependency, boolean>) {
    let callables: Types.CallableDescriptor[] = [...data.callables];
    
    for(const dep of data.dependencies) {
        if(visited.get(dep) === true) {
            continue;
        }
        visited.set(dep, true);
        const depData = dependenciesData.get(dep);
        callables = callables.concat(getCallablesImpl(depData, dependenciesData, visited));
    }

    return callables;
}

function getCallablesWithLocationImpl(data: Types.DocumentData, dependenciesData: WeakMap<DepMng.FileDependency, Types.DocumentData>, visited: Map<DepMng.FileDependency, boolean>, results: CallablesWithLocationResults) {
    results.set(data.uri, data.callables);

    for(const dep of data.dependencies) {
        if(visited.get(dep) === true) {
            continue;
        }
        visited.set(dep, true);

        getCallablesWithLocationImpl(dependenciesData.get(dep), dependenciesData, visited, results);
    }
}

export function getCallables(data: Types.DocumentData, dependenciesData: WeakMap<DepMng.FileDependency, Types.DocumentData>): Types.CallableDescriptor[] {
    return getCallablesImpl(data, dependenciesData, new Map());
}

export function getCallablesWithLocation(data: Types.DocumentData, dependenciesData: WeakMap<DepMng.FileDependency, Types.DocumentData>) {
    const results: CallablesWithLocationResults = new Map();
    getCallablesWithLocationImpl(data, dependenciesData, new Map(), results);
    return results;
}