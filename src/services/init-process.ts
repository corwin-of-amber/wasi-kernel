import * as wasmer from "@wasmer/sdk";
import { WasmerInitInput } from "@wasmer/sdk";

import { FsHookMaster } from '.';


/**
 * The init process is a worker responsible for spawning all other
 * processes. This is sometimes desirable because spawned processes
 * may require some synchronous work to be done by their parent,
 * and the top-level (renderer) process is not allowed to block.
 * Esp., the filesystem hook uses `Atomics.wait` regularly.
 */
class InitProcess {
    worker: Worker

    constructor(init: WasmerInitInput, memory?: WebAssembly.Memory) {
        this.worker = new Worker(init.workerUrl, {name: 'wasik-init'});
        this.worker.postMessage({type: 'init', ...init, memory});
        this.worker.addEventListener('message', (ev) =>
            FsHookMaster.current()?.intercept(ev.data));
    }

    spawn(bin: Uint8Array | WebAssembly.Module, runOpts: any = {}) {
        let chan = new MessageChannel();
        this.worker.postMessage({
            type: 'spawn',
            mode: 'wasix',
            bin,
            runOpts,
            port: chan.port2
        }, [chan.port2]);        
        
        return new Promise<wasmer.Instance>(resolve => {
            chan.port1.addEventListener('message', m => resolve(m.data));
            chan.port1.start();
        });
    }
}


export { InitProcess }