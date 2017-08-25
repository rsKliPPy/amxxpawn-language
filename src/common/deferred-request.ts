'use strict';

type ResolveParam<T> = T | PromiseLike<T>
export class DeferredRequest<T> {
    public promise: Promise<T>;

    private _resolveFunction: (value?: ResolveParam<T>) => void;
    private _rejectFunction: (reason?: any) => void;
    
    public constructor() {
        this.promise = new Promise((resolve, reject) => {
            this._resolveFunction = resolve;
            this._rejectFunction = reject;
        });
    }

    public resolve(value?: ResolveParam<T>) {
        this._resolveFunction(value);
    }
    public reject(reason?: any) {
        this._rejectFunction(reason);
    }
}