//
// build with:
//   kremlin -o bootstrap/build/worker src/init.ts
//
import { Proc } from './core/bits/proc';


function initHook(imp: {env?: object, wasik_ext?: object}, m: WebAssembly.Module) {
    //console.warn('hook', this, imp);

    imp.env = Object.fromEntries(WebAssembly.Module.imports(m)
        .flatMap(e => e.module === 'env' ? [[e.name, () => console.warn(e)]] : []));

    let proc = new Proc;
    imp.env ??= {};
    for (let method of ['__control_setjmp', 'longjmp'])
      imp.env[method] = proc[method].bind(proc);

    imp.wasik_ext = {'sorry': () => 0, 'dlerror_get': () => 0};
    globalThis.proc = proc; // dev mode
    return proc;
}


globalThis.init_hook = initHook;

export { initHook }