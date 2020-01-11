// build with
// parcel watch --no-hmr src/kernel/worker.ts

import { ExecCore } from "./exec";
import { SharedVolume } from "./services/shared-fs";
import { postMessage, onMessage } from './bindings/workers';


const core = new ExecCore({tty: true});

postMessage(core.share());
    
core.on('stream:out',   ev => postMessage(ev));
core.tty.on('data',     ev => postMessage({event: 'tty:data', arg: ev}));
core.proc.on('syscall', ev => postMessage({event: 'syscall', arg: ev}));

onMessage(async (ev) => {
    if (ev.data.upload) {
        for (let fn in ev.data.upload) {
            core.wasmFs.fs.writeFileSync(fn, ev.data.upload[fn]);
        }
    }
    if (ev.data.volume) {
        core.mountFs(SharedVolume.from(ev.data.volume));
    }
    if (ev.data.exec) {
        let wasm = ev.data.exec, argv = ev.data.opts && ev.data.opts.argv,
            env = ev.data.opts && ev.data.opts.env;
        try {
            let exitcode = await core.start(wasm, argv, env);
            postMessage({event: 'exit', arg: {code: exitcode}});
        }
        catch (e) {
            postMessage({event: 'error', arg: e});
        }
    }
});


// @ts-ignore
self.core = core;   // useful for debugging