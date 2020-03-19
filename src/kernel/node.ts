import { WorkerProcess } from './process';
import fs from 'fs';

var wasm = process.argv[2] || './busy.wasm';

if (!fs.existsSync(wasm)) {
    throw new Error(`The file ${wasm} doesn't exist`);
}

new WorkerProcess(wasm)
    .on('error', (err, wasm)=> {
        console.error(`\nFailed to run '${wasm}';\n`);
        console.error(err);        
    })
    .on('exit', (ev) => { console.log(ev); process.exit(ev.code); });
