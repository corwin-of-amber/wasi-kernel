import { ExecCore } from "./exec";
import { WASI } from "@wasmer/wasi/lib";
import { onMessageType, postMessageType } from "./bindings/workers";

const setup = (postMessageImpl: postMessageType, onMessage: onMessageType, defaultBindings: any) => {
    WASI.defaultBindings = defaultBindings;
    const core = new ExecCore({tty: true});

    const shared = core.share();
    postMessageImpl(shared);
    
    core.on('stream:out',  ev => postMessageImpl(ev));
    core.tty.on('data',    ev => postMessageImpl({event: 'tty:data', arg: ev}));
    core.proc.on('signal', ev => postMessageImpl({event: 'signal', arg: ev}));
    core.proc.on('spawn',  ev => postMessageImpl({event: 'spawn', arg: ev}));
    
    onMessage(async (ev) => {
        if (ev.data.exec) {
            let wasm = ev.data.exec, argv = ev.data.opts && ev.data.opts.argv;
            try {
                let exitcode = await core.start(wasm, argv);
                postMessageImpl({event: 'exit', arg: {code: exitcode}});
            }
            catch (e) {
                postMessageImpl({event: 'error', arg: e});
            }
        }
    });
    return core
}


export { setup };