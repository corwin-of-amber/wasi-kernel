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
        try {
            await core.start(ev.data.exec, ev.data.opts && ev.data.opts.argv);
        }
        catch (e) {
            const event = (e instanceof WASIExitError) ? 'exit' : 'error';
            postMessage({event, arg: Object.assign({}, e)});
            return;
        }
        postMessage({event: 'exit', arg: {code: 0}});
    }
});


export { core };  // useful for debugging