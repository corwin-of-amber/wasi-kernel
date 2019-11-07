import { WorkerProcess } from './process';
import { Worker } from './bindings/workers/node';
import fs from 'fs';

var wasm = process.argv[2] || __dirname+'/../../busy.wasm';

if (!fs.existsSync(wasm)) {
    throw new Error(`The file ${wasm} doesn't exist`);
}

new WorkerProcess(wasm, new Worker(__dirname+'/./worker-node.js') as any)
    .on('error', (err, wasm)=> {
        console.error(`\nFailed to run '${wasm}';\n`);
        console.error(err);        
    })
    .on('exit', (ev) => { console.log(ev); process.exit(ev.code); });
