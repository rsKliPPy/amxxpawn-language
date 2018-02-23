'use strict';

import * as Types from './types';
import * as DM from './dependency-manager';

type CallablesWithLocationResults = Map<string, Types.CallableDescriptor[]>;
export interface SymbolsResults {
    callables: Types.CallableDescriptor[];
    values: Types.ValueDescriptor[];
}

function getSymbolsImpl(
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>,
    visited: Map<DM.FileDependency, boolean>) {

    let symbols: SymbolsResults = {
        callables: [...data.callables],
        values: [...data.values]
    };
    for(const dep of data.dependencies) {
        if(visited.get(dep) === true) {
            continue;
        }
        visited.set(dep, true);
        const depData = dependenciesData.get(dep);

        const results = getSymbolsImpl(depData, dependenciesData, visited);
        symbols.callables = symbols.callables.concat(results.callables);
        symbols.values = symbols.values.concat(results.values);
    }

    return symbols;
}

/*
function getCallablesWithLocationImpl(
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency,
    Types.DocumentData>, visited: Map<DM.FileDependency, boolean>,
    results: CallablesWithLocationResults) {

    results.set(data.uri, data.callables);
    for(const dep of data.dependencies) {
        if(visited.get(dep) === true) {
            continue;
        }
        visited.set(dep, true);

        getCallablesWithLocationImpl(dependenciesData.get(dep), dependenciesData, visited, results);
    }
}
*/

function removeDependenciesImpl(
    deps: DM.FileDependency[],
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>,
    visited: Map<DM.FileDependency, boolean>) {

    for(const dep of deps) {
        if(visited.get(dep) === true) {
            continue;
        }
        visited.set(dep, true);

        if(dependencyManager.getDependency(dep.uri) === undefined) {
            continue;
        }

        dependencyManager.removeReference(dep.uri);
        if(dependencyManager.getDependency(dep.uri) === undefined) { // No references left
            removeDependenciesImpl(dependenciesData.get(dep).dependencies, dependencyManager, dependenciesData, visited);
        }
    }
}

function getReachableDependencies(
    depData: Types.DocumentData,
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>,
    visited: Map<DM.FileDependency, boolean>) {

    const reachableDeps: DM.FileDependency[] = [...depData.dependencies];
    for(const dep of depData.dependencies) {
        if(visited.get(dep) === true) {
            continue;
        }
        visited.set(dep, true);

        reachableDeps.push(...getReachableDependencies(dependenciesData.get(dep), dependencyManager, dependenciesData, visited));
    }

    return reachableDeps;
}

export function getSymbols(
    data: Types.DocumentData,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>): SymbolsResults {

    return getSymbolsImpl(data, dependenciesData, new Map());
}

/*
export function getCallablesWithLocation(data: Types.DocumentData, dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>) {
    const results: CallablesWithLocationResults = new Map();
    getCallablesWithLocationImpl(data, dependenciesData, new Map(), results);
    return results;
}
*/

export function removeDependencies(
    deps: DM.FileDependency[],
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>) {

    removeDependenciesImpl(deps, dependencyManager, dependenciesData, new Map());
}

export function removeUnreachableDependencies(
    roots: Types.DocumentData[],
    dependencyManager: DM.FileDependencyManager,
    dependenciesData: WeakMap<DM.FileDependency, Types.DocumentData>) {

    const reachableDeps: DM.FileDependency[] = [];
    const visited: Map<DM.FileDependency, boolean> = new Map();
    for(const root of roots) {
        reachableDeps.push(...getReachableDependencies(root, dependencyManager, dependenciesData, visited));
    }
    const unreachableDepsUris = dependencyManager.getAllDependencies().filter((dep) => reachableDeps.indexOf(dep) < 0).map((dep) => dep.uri);

    for(const uri of unreachableDepsUris) {
        const udep = dependencyManager.getDependency(uri);
        if(udep !== undefined) {
            removeDependencies(dependenciesData.get(udep).dependencies, dependencyManager, dependenciesData);
        }
    }
}
