import { System } from 'wasi-kernel';
import { MiniTerm } from './miniterm';

const uris = {
    wasmBindgen: '/node_modules/wasi-kernel/node_modules/@wasmer/sdk/dist/wasmer_js_bg.wasm',
    sdk: '/node_modules/wasi-kernel/node_modules/@wasmer/sdk/dist/index.mjs',
    worker: '/node_modules/wasi-kernel/dist/worker.mjs'
}


async function main() {
    const sys = new System(uris);
    
    Object.assign(window, { sys });
    let cp = await sys.runWasix(new URL("busy.wasm", window.location.href), {
        program: "ls"
    });
    Object.assign(window, { cp });

    let term = new MiniTerm(document.querySelector('#stdout'));
    cp.pipeInto(term);
}

document.addEventListener('DOMContentLoaded', main);