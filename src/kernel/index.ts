import { WorkerProcess, BareProcess, ExecCore } from './process';

if (typeof module !== 'undefined' && module.id === '.') {
    new WorkerProcess('busy-wasi.wasm', './dist/worker.cjs.js').on('error', (err, wasm)=> {
        console.error(`Failed to run '${wasm}';`);
        console.error(err);        
    });
}


export { WorkerProcess, BareProcess, ExecCore }