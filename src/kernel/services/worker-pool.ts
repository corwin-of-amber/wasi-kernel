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
                process: new WorkerProcess(null),
                promise: null
            };
            p.process.on('tty:data', x => this.emit('worker:data', p, x));
            this.handleSpawns(p.process);
            this.loader.populate(p, {wasm, argv, env});
        }
        this.loader.exec(p, {wasm, argv, env});
        this.running.add(p);
        p.promise = p.process.waitFor().finally(() => {
            this.running.delete(p);
            this.free.push(p);
        });
        return p;
    }

    populate(item: WorkerPoolItem, spawnArgs: {wasm: string, argv: string[], env?: {}}) { }

    exec(item: WorkerPoolItem, spawnArgs: SpawnArgs) {
        if (spawnArgs.env) item.process.opts.env = spawnArgs.env;
        item.process.exec(spawnArgs.wasm, spawnArgs.argv);
    }

    handleSpawns(parent: WorkerProcess) {
        parent.on('syscall', (e) => {
            if (e.func == 'spawn') {
                let d = e.data;
                var argv = this.parseArgv(d.execv.argv),
                    env = Object.assign(d.env, this.parseEnviron(d.execv.envp));
                try {
                    var p = this.loader.spawn(d.execv.prog, argv, env),
                        exitcode = -1;
                    p.promise
                        .then((ev: {code: number}) => exitcode = ev.code)
                        .finally(() => {
                            parent.childq.enqueue(d.pid);
                            parent.childq.enqueue(exitcode);
                        });
                }
                catch (e) {
                    console.error('error during spawn', d.execv);
                    console.error(e);
                    // it's unfortunately too late to fail the original
                    // execv or spawn at this point
                    parent.childq.enqueue(d.pid);
                    parent.childq.enqueue(-1);
                }
            }
        });
    }

    parseArgv(argv: Uint8Array[]) {
        return argv.map((a) => Buffer.from(a).toString('utf-8'));
    }

    parseEnviron(envp: Uint8Array[]) {
        var ret = {};
        for (let entry of envp) {
            var s = Buffer.from(entry).toString('utf-8'),
                eqIdx = s.indexOf('=');
            if (eqIdx > -1) {
                ret[s.substring(0, eqIdx)] = s.substring(eqIdx + 1);
            }
        }
        return ret;
    }

}


type WorkerPoolItem = {
    process: WorkerProcess
    promise: Promise<{}>
};

interface ProcessLoader {
    spawn(wasm: string, argv: string[], env?: {}): WorkerPoolItem;
    populate(item: WorkerPoolItem, spawnArgs: SpawnArgs): void;
    exec(item: WorkerPoolItem, spawnArgs: SpawnArgs): void;
}

type SpawnArgs = {wasm: string, argv: string[], env?: {}};


export { WorkerPool, WorkerPoolItem, ProcessLoader, SpawnArgs }