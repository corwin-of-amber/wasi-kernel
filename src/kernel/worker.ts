import { ExecCore } from "./process";
import { postMessage, onMessage } from './bindings/workers';


const core = new ExecCore({tty: true});


postMessage(core.share());

core.on('stream:out',  ev => postMessage(ev));
core.proc.on('signal', ev => postMessage({event: 'signal', arg: ev}));
core.proc.on('spawn',  ev => postMessage({event: 'spawn', arg: ev}));

onMessage(async (ev) => {
    if (ev.data.exec) {
        try {
            await core.start(ev.data.exec);
        }
        catch (e) { postMessage({event: 'error', arg: e}); }
        postMessage({event: 'exit', arg: {code: 0}});
    }
});


export { core };  // useful for debugging