import { EventEmitter } from 'events';
import { WorkerProcess } from '../process';



/**
 * Maintains a pool of WorkerProcess instances for running WASI
 * modules.
 * Workers are reused after termination.
 * Terminated pids are reported to parent processes for interoperation
 * with wait calls.
 */
class WorkerPool extends EventEmitter implements ProcessLoader {
    
    running: Set<WorkerPoolItem>
    free: WorkerPoolItem[]

    loader: ProcessLoader

    constructor() {
        super();
        this.running = new Set;
        this.free = [];
        this.loader = this;
    }

    spawn(wasm: string, argv: string[], env?: {}): WorkerPoolItem {
        var p = this.free.pop();
        if (!p) {
            p = {
                process: new WorkerProcess(null), //wasm, {argv, env}),
                promise: null
            };
            p.process.on('tty:data', x => this.emit('worker:data', p, x));
            this.handleSpawns(p.process);
            this.loader.populate(p);
        }
        if (env) p.process.opts.env = env;
        p.process.exec(wasm, argv);
        this.running.add(p);
        p.promise = p.process.waitFor().finally(() => {
            this.running.delete(p);
            this.free.push(p);
        });
        return p;
    }

    populate(item: WorkerPoolItem) { }

    handleSpawns(parent: WorkerProcess) {
        parent.on('syscall', (e) => {
            if (e.func == 'spawn') {
                let d = e.data;
                var argv = d.execv.argv.map(
                    (a: Uint8Array) => Buffer.from(a).toString('utf-8'));
                var p = this.loader.spawn(d.execv.prog, argv, d.env),
                    exitcode = -1;
                p.promise
                    .then((ev: {code: number}) => exitcode = ev.code)
                    .finally(() => {
                        parent.childq.enqueue(d.pid);
                        parent.childq.enqueue(exitcode);
                    });
            }
        });
    }

}


type WorkerPoolItem = {
    process: WorkerProcess
    promise: Promise<{}>
};

interface ProcessLoader {
    spawn(wasm: string, argv: string[], env?: {}): WorkerPoolItem;
    populate(item: WorkerPoolItem): void;
}



export { WorkerPool, WorkerPoolItem, ProcessLoader }