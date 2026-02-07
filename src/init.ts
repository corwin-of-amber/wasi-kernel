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
            imp.env[e.name] = () => { console.warn('[stub]', e); return 0; }
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


globalThis.init_hook = initHook;

export { initHook }