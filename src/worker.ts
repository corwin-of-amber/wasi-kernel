//
// build with:
//   kremlin -o bootstrap/build/worker src/worker.ts
//
import type * as wasmer from "@wasmer/sdk";
import './init';


class WasikThreadPoolWorker {
    wasmer: typeof wasmer
    worker: any /* wasmer.ThreadPoolWorker */

    constructor(wasmer: WasikThreadPoolWorker['wasmer']) {
        this.wasmer = wasmer;
    }

    async init(id: number, iin: wasmer.WasmerInitInput) {
        await this.wasmer.init(iin);
        // @ts-ignore
        this.worker = id ? new this.wasmer.ThreadPoolWorker(id) : {}
    }

    async consume(messages: (ThreadPoolWorkerMessage | SpawnRequest)[]) {
        for (const msg of messages.splice(0, messages.length)) {
            await this.handleMessage(msg);
        }
    }

    async handleMessage(msg: ThreadPoolWorkerMessage | SpawnRequest) {
        if (msg.type === "spawn") {
            await this.spawn(msg);
        }
        else {
            await this.worker.handle(msg);
        }
    };

    handleError(err: any) {
        if (err instanceof WebAssembly.Exception) {
            console.error('[C++ uncaught exception]', globalThis.proc.stdExceptionWhat(err));
        }
        else if (!this.Trap_isTrap(err)) {
            console.error('[unknown error from Wasm]', err);
        }
    }

    async spawn(msg: SpawnRequest) {
        const { bin, runOpts } = msg;
        if (runOpts?.mount) {
            /** @todo `mount` may contain `DirectoryInit` entries as well */
            runOpts.mount = Object.fromEntries(Object.entries(runOpts.mount)
                .map(([k, v]) => [k, this.Directory_borrowFrom(v)]));
        }
        if (runOpts?.runtime) {
            runOpts.runtime = this.Runtime_borrowFrom(runOpts.runtime);
        }
        let p = await this.wasmer.runWasix(bin, runOpts ?? {});
        // send process pipes back to sender
        msg.port.postMessage(
            {stdin: p.stdin, stdout: p.stdout, stderr: p.stderr},
            [p.stdin, p.stdout, p.stderr].filter(x => x)
        );
    }

    Directory_borrowFrom(wbgobj: any) {
        return borrowFrom<wasmer.Directory>(wbgobj, this.wasmer.Directory)
    }
    Runtime_borrowFrom(wbgobj: any) {
        return borrowFrom<wasmer.Runtime>(wbgobj, this.wasmer.Runtime)
    }
    Trap_isTrap(wbjobj: any) {
        /** @todo check prototype */
        return wbjobj.__wbg_ptr !== undefined;
    }
}

type wptr = number
type ThreadPoolWorkerMessage = any
type SpawnRequest = {bin: Uint8Array, runOpts: wasmer.RunOptions, port: MessagePort}

/** Like `<Class>.__wrap` but without finalization. */
function borrow<Class extends object>(ptr: wptr, clas: {prototype: Class}) {
    ptr = ptr >>> 0;
    const obj = Object.create(clas.prototype);
    obj.__wbg_ptr = ptr;
    return obj;
}

function borrowFrom<Class extends object>(wbgobj: any, clas: {prototype: Class}) {
    return borrow<Class>(wbgobj.__wbg_ptr, clas);
}


globalThis.fs_hook = {
    initiated(fs) {
        this.fs = fs;
    },
    dispatch: (op) => {
        console.warn('== fs_hook ==', op);
        let out = new SharedArrayBuffer(8, {maxByteLength: 8e6});
        postMessage({op, out});
        Atomics.wait(new Int32Array(out), 0, 0);
    },
    async intercept(m) {
        postMessage(m); // forward to parent until intercepted by main thread
    }
}


globalThis.WasikThreadPoolWorker = WasikThreadPoolWorker
export { WasikThreadPoolWorker }