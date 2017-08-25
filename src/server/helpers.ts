'use strict';

import * as Types from './types';
import * as DepMng from './dependency-manager';

/*
// This function wallks the dependency tree and tries to find the given callable
function findCallable(identifier: string, data: Types.DocumentData, depsData: WeakMap<DepMng.FileDependency, Types.DocumentData>): Types.CallableDescriptor {
    const callableIndex = data.callables.map((callable) => callable.identifier).indexOf(identifier);
    if(callableIndex >= 0) {
        return data.callables[callableIndex];
    } else {
        for(const dep of data.dependencies) {
            const depData = depsData.get(dep); // It's guaranteed to contain it
            const result = findCallable(identifier, depData, depsData);
            if(result !== undefined) {
                return result;
            }
        }
    }

    return undefined;
}
*/

function getCallablesImpl(data: Types.DocumentData, dependenciesData: WeakMap<DepMng.FileDependency, Types.DocumentData>, visited: Map<DepMng.FileDependency, boolean>) {
    let callables: Types.CallableDescriptor[] = [...data.callables];
    
    for(const dep of data.dependencies) {
        if(visited.get(dep) === true) {
            continue;
        }
        visited.set(dep, true);
        const depData = dependenciesData.get(dep); // It's guaranteed to contain it
        callables = callables.concat(getCallablesImpl(depData, dependenciesData, visited));
    }

    return callables;
}

export function getCallables(data: Types.DocumentData, dependenciesData: WeakMap<DepMng.FileDependency, Types.DocumentData>): Types.CallableDescriptor[] {
    return getCallablesImpl(data, dependenciesData, new Map());
}