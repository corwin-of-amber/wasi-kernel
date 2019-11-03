import { WorkerProcess, BareProcess } from './process';

if (typeof module !== 'undefined' && module.id === '.') {
    var wasm = process.argv[2] || 'dash.wasm';
    new WorkerProcess(wasm, './dist/worker.cjs.js')
    //new BareProcess(wasm)
        .on('error', (err, wasm)=> {
            console.error(`\nFailed to run '${wasm}';\n`);
            console.error(err);        
        })
        .on('exit', (ev) => { console.log(ev); process.exit(ev.code); });
}


export { WorkerProcess, BareProcess }