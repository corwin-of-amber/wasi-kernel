import { WorkerProcess, BareProcess, ExecCore } from './process';

if (typeof module !== 'undefined' && module.id === '.') {
    new BareProcess('busy-wasi.wasm');
}


export { WorkerProcess, ExecCore }