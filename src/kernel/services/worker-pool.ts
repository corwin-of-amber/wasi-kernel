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
    running: Set<WorkerPoolItem>
    free: WorkerPoolItem[]

    loader: ProcessLoader

    constructor(workerScript: string) {
        super();
        this.workerScript = workerScript;
        this.running = new Set;
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
        this.running.add(p);
        p.promise = p.process.waitFor().finally(() => {
            this.running.delete(p);
            this.free.push(p);
        });
        return p;
    }

    handleSpawns(parent: Process) {
        parent.on('spawn', (e) => {
            if (e.execv) {
                var argv = e.execv.argv.map(
                    (a: Uint8Array) => Buffer.from(a).toString('utf-8'));
                var p = this.loader.spawn(e.execv.prog, argv, e.env),
                    exitcode = -1;
                p.promise
                    .then((ev: {code: number}) => exitcode = ev.code)
                    .finally(() => {
                        parent.childq.enqueue(e.pid);
                        parent.childq.enqueue(exitcode);
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