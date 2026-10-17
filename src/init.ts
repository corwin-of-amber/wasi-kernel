//
// build with:
//   kremlin -o bootstrap/build/worker src/init.ts
//
import { Proc, i32 } from './core/bits/proc';


function initHook(imp: WebAssembly.Imports, m: WebAssembly.Module) {
    imp.env ??= {};
    
    // Generate stubs for missing system functions
    // (note: assumes that wasmer does not place its syscalls in `env`)
    for (let e of WebAssembly.Module.imports(m)) {
        if (e.module === 'env' && e.kind === 'function')
            imp.env[e.name] = () => { console.warn('[stub]', e); return 0; }
    }

    let proc = new Proc;
    proc._imports = imp;
    proc.trace.syscalls = console.warn;
    //proc.dyld.trace = console.warn;

    // Polyfill stubs
    // - exception handling
    for (let tag of ['__cpp_exception', '__c_longjmp'])
        imp.env[tag] = new WebAssembly.Tag({parameters: ['i32']}) as any;
    imp.env['__cxa_allocate_exception'] = (sz: i32) => {
        console.warn('[stub] cxa_alloc', sz);
        return 20000;  /* @@ arbitrary address */
    };
    imp.env['__cxa_throw'] = (a0: i32, a1: i32, a2: i32) => {
        console.warn('[stub] cxa_throw', a0, a1, a2);
        throw new Error(`[C++ exception] ${proc.userGetCStringUTF8(
            proc.mem.getUint32(a0 + 4, true))}`);
    };
    // -  (libunwind)
    imp.env['_Unwind_RaiseException'] = () => {
        throw new Error(`[C++ exception] (not implemented)`);
    }
    
    // Provide Proc instance services
    proc.importsObj(imp);

    /** @todo this is for Rocq actually :) ^- */
    proc.dyld.extern = {js: {interrupt_pending: () => 0}};

    globalThis.proc = proc; // dev mode
    return proc;
}


globalThis.init_hook = initHook;

export { initHook }