import { EventEmitter } from 'events';
import { ProcessBase as Process, WorkerProcess } from '../process';



/**
 * Maintains a pool of WorkerProcess instances for running WASI
 * modules.
 * Workers are reused after termination.
 * Terminated pids are reported to parent processes for interoperation
 * with wait calls.
 */
class WorkerPool extends EventEmitter implements ProcessLoader {
    
    workerScript: string
    free: WorkerPoolItem[]

    loader: ProcessLoader

    constructor(workerScript: string) {
        super();
        this.workerScript = workerScript;
        this.free = [];
        this.loader = this;
    }

    spawn(wasm: string, argv: string[], env?: {}): WorkerPoolItem {
        var p = this.free.pop();
        if (p) {
            if (env) p.process.opts.env = env;
            p.process.exec(wasm, argv);
        }
        else {
            p = {
                process: new WorkerProcess(wasm, this.workerScript, {argv, env}),
                promise: null
            };
            p.process.on('tty:data', x => this.emit('worker:data', p, x));
            this.handleSpawns(p.process);
        }
        p.promise = p.process.waitFor().finally(() => {
            this.free.push(p);
        });
        return p;
    }

    handleSpawns(parent: Process) {
        parent.on('spawn', (e) => {
            console.log(e);
            if (e.execv) {
                var argv = e.execv.argv.map(
                    (a: Uint8Array) => Buffer.from(a).toString('utf-8'));
                var p = this.loader.spawn(e.execv.prog, argv, e.env);
                p.promise.finally(() => {
                    parent.childq.enqueue(e.pid);
                });
            }
        });
    }

}


type WorkerPoolItem = {
    process: Process
    promise: Promise<{}>
};

interface ProcessLoader {
    spawn(wasm: string, argv: string[], env?: {}): WorkerPoolItem;
}



export { WorkerPool, WorkerPoolItem, ProcessLoader }