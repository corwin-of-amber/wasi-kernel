import { ExecCore } from "./exec";
import { postMessage, onMessage } from './bindings/workers';
import { WASIExitError } from "@wasmer/wasi";


const core = new ExecCore({tty: true});


postMessage(core.share());

core.on('stream:out',  ev => postMessage(ev));
core.proc.on('signal', ev => postMessage({event: 'signal', arg: ev}));
core.proc.on('spawn',  ev => postMessage({event: 'spawn', arg: ev}));

onMessage(async (ev) => {
    if (ev.data.exec) {
        let wasm = ev.data.exec, argv = ev.data.opts && ev.data.opts.argv;
        try {
            let exitcode = await core.start(wasm, argv);
            postMessage({event: 'exit', arg: {code: exitcode}});
        }
        catch (e) {
            postMessage({event: 'error', arg: e});
        }
    }
});


export { core };  // useful for debugging