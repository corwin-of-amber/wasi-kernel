//
// build with:
//   kremlin -o bootstrap/build/worker src/init.ts
//
import { Proc } from './core/bits/proc';

let proc = new Proc;


function initHook(imp: {env?: object, wasik?: object}, m: WebAssembly.Module) {
    imp.env ??= {};
    imp.wasik ??= {};
    
    // Generate stubs for missing system functions
    for (let e of WebAssembly.Module.imports(m)) {
        if (e.module === 'env' && e.kind === 'function')
            imp.env[e.name] = () => console.warn('[stub]', e);
    }

    // Provide Proc instance services
    for (let [ns, ext] of proc.imports())
        for (let [k, v] of ext) imp[ns][k] = v;

    proc.trace.syscalls = console.warn;
    //proc.dyld.trace = console.warn;

    /** @todo this is for Rocq actually :) ^- */
    proc.dyld.extern = {js: {interrupt_pending: () => 0}};

    globalThis.proc = proc; // dev mode
    return proc;
}


class FsHookMaster {
    actions = new Map<number, () => Promise<void>>()

    with(actions: typeof this.actions) {
        for (let [k, v] of actions.entries())
            this.actions.set(k, v);
        return this;
    }

    dispatch() { console.warn(' fs hook dispatch from main thread?') }

    async intercept(m: {op: number, out: SharedArrayBuffer}) {
        console.log('==  fs hook intercept ==', m);
        if (m.op !== undefined) {
            let op = this.actions.get(m.op);
            this.actions.delete(m.op);  // each op is single-shot
            if (op) await op();

            if (m.out)
                Atomics.notify(new Int32Array(m.out), 0);
        }
    }
}


globalThis.init_hook = initHook;

export { initHook, FsHookMaster }