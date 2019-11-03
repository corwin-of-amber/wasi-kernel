import { ExecCore } from "./process";
import { WASI } from "@wasmer/wasi/lib";
import { onMessageType, postMessageType } from "./bindings/workers";

const setup = (postMessageImpl: postMessageType, onMessage: onMessageType, defaultBindings: any) => {
    WASI.defaultBindings = defaultBindings;
    const core = new ExecCore({tty: true});

    const shared = core.share();
    postMessageImpl(shared);
    
    core.on('stream:out',  ev => postMessageImpl(ev));
    core.proc.on('signal', ev => postMessageImpl({event: 'signal', arg: ev}));
    core.proc.on('spawn',  ev => postMessageImpl({event: 'spawn', arg: ev}));
    
    onMessage(async (ev) => {
        if (ev.data.exec) {
            try {
                await core.start(ev.data.exec);
            }
            catch (e) { postMessageImpl({event: 'error', arg: e}); }
            postMessageImpl({event: 'exit', arg: {code: 0}});
        }
    });
    return core
}


export { setup };  // useful for debugging