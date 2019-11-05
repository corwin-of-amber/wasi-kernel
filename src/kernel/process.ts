import { EventEmitter } from 'events';

import { Stdin, TransformStreamDuplex } from './streams';
import { SignalVector, ChildProcessQueue } from './bits/proc';

import { Worker } from './bindings/workers';
import { SharedQueue } from './bits/queue';
import { ExecCore, ExecCoreOptions } from './exec';



abstract class ProcessBase extends EventEmitter {

    opts: ProcessStartupOptions

    stdin:  TransformStreamDuplex
    stdout: TransformStreamDuplex

    stdin_raw: Stdin
    sigvec: SignalVector
    childq: ChildProcessQueue

    constructor(opts: ProcessStartupOptions) {
        super();
        this.opts = opts;
        
        if (typeof TextEncoderStream !== 'undefined') {
            this.stdin = new TransformStreamDuplex(new TextEncoderStream());
            this.stdin.on('data', bytes => this.stdin_raw.write(bytes));

            this.stdout = new TransformStreamDuplex(new TextDecoderStream());
        }
        else if (typeof process !== 'undefined') {
            process.stdin.on('data', buf => this.stdin_raw.write(buf));
            this.stdout = <any>process.stdout;
        }
    }

    abstract exec(wasm: string): void;

    waitFor() {
        var herr: (e: Error) => void, hexit: (ev: {code:number}) => void;

        return new Promise((resolve, reject) => {
            this.on('error', herr = (e: Error) => reject(e));
            this.on('exit', hexit = (ev: {code:number}) => resolve(ev));
        }).finally(() => {
            this.removeListener('error', herr);
            this.removeListener('exit', hexit);
        });
    }    
}


/**
 * Suitable for running a WASI process in a Web Worker or
 * a Node.js worker thread.
 */
class WorkerProcess extends ProcessBase {

    worker : Worker

    constructor(wasm : string, workerJs : string, opts: ProcessStartupOptions={}) {
        super(opts);
        
        this.worker = new Worker(workerJs);
        this.worker.addEventListener('message', ev => {
            if (ev.data.stdin)  this.stdin_raw = Stdin.from(ev.data.stdin);
            if (ev.data.sigvec) this.sigvec = SignalVector.from(ev.data.sigvec);
            if (ev.data.childq) this.childq = SharedQueue.from(ev.data.childq);
            if (ev.data.fd)     this.stdout.write(ev.data.data);

            if (ev.data.event)  this.emit(ev.data.event, ev.data.arg, wasm);

            /*
            if (ev.data.event === 'spawn') {
                console.log('spawn', ev.data.arg);
                setTimeout(() => {
                    console.log("- wake rainbow -");
                    this.childq.enqueue(ev.data.arg.pid);
                }, 1000);
            }*/
        });

        if (wasm) this.exec(wasm);
    }

    exec(wasm: string, argv?: string[]) {
        if (argv) this.opts.argv = argv;
        this.worker.postMessage({exec: wasm, opts: this.opts});
    }
}


class BareProcess extends ProcessBase {

    core: ExecCore;

    constructor(wasm: string, opts: ProcessStartupOptions={}) {
        super(opts);
        this.exec(wasm);
    }

    async exec(wasm: string) {
        const {ExecCore} = await import('./exec');  // on-demand import

        this.core = new ExecCore(this.opts);
        this.core.on('stream:out', ev => process.stdout.write(ev.data));
        try {
            let exitcode = await this.core.start(wasm, this.opts.argv);
            this.emit('exit', {code: exitcode});
        }
        catch (err) {
            this.emit('error', err, wasm);
        }
    }
}


type ProcessStartupOptions = ExecCoreOptions & {
    argv?: string[];
}



export { WorkerProcess, BareProcess, ProcessStartupOptions }
