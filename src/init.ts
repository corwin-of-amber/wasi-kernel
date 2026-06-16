//
// build with:
//   kremlin -o bootstrap/build/worker src/init.ts
//
import { Proc, i32 } from './core/bits/proc';

let proc = new Proc;


function initHook(imp: {env?: object, wasik?: object}, m: WebAssembly.Module) {
    imp.env ??= {};
    imp.wasik ??= {};
    
    // Generate stubs for missing system functions
    for (let e of WebAssembly.Module.imports(m)) {
        if (e.module === 'env' && e.kind === 'function')
            imp.env[e.name] = () => { console.warn('[stub]', e); return 0; }
    }

    // Polyfill stubs
    // - exception handling
    imp.env['__cxa_allocate_exception'] = (sz: i32) => {
        console.warn('[stub] cxa_alloc', sz); return 20000;  /* @@ arbitrary address */
    };
    imp.env['__cxa_throw'] = (a0: i32, a1: i32, a2: i32) => {
        console.warn('[stub] cxa_throw', a0, a1, a2);
        throw new Error(`[C++ exception] ${proc.userGetCStringUTF8(
            proc.mem.getUint32(a0 + 4, true))}`);
    };
    
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