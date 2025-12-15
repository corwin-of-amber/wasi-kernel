//
// build with:
//   kremlin -o bootstrap/build/worker src/init.ts
//
import { Proc } from './core/bits/proc';


function initHook(imp: {env?: object, wasik_ext?: object}, m: WebAssembly.Module) {
    imp.env ??= {};
    
    // Generate stubs for missing system functions
    for (let e of WebAssembly.Module.imports(m)) {
        if (e.module === 'env' && e.kind === 'function')
            imp.env[e.name] = () => console.warn('[stub]', e);
    }

    // Provide Proc instance services
    let proc = new Proc;
    for (let [k, v] of proc.imports()) imp.env[k] = v;

    imp.wasik_ext = {'sorry': () => 0, 'dlerror_get': () => 0};
    globalThis.proc = proc; // dev mode
    return proc;
}


globalThis.init_hook = initHook;

export { initHook }