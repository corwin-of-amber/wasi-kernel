import { ExecCore } from "./process";
import { postMessage, onMessage } from './bindings/workers';


const core = new ExecCore({tty: true});


postMessage({stdin: core.stdin});

core.on('stream:out', ev => postMessage(ev));

onMessage((ev) => {
    if (ev.data.exec) core.start(ev.data.exec);
});
