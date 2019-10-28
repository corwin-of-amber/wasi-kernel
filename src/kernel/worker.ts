import { ExecCore } from "./process";
import { postMessage, onMessage } from './bindings/workers';


const core = new ExecCore({tty: true});


postMessage({stdin: core.stdin});

core.on('stream:out', ev => postMessage(ev));

onMessage(async (ev) => {
    if (ev.data.exec) {
        try {
            await core.start(ev.data.exec);
        }
        catch (e) { postMessage({error: e}); }
        postMessage({exit: {code: 0}});
    }
});
