import { EventEmitter } from 'events';

import { SimplexStream, TransformStreamDuplex } from './streams';
import { TtyProps } from './bits/tty';
import { SignalVector, ChildProcessQueue } from './bits/proc';

import { Worker } from './bindings/workers';
import { SharedQueue } from './bits/queue';
import { ExecCore, ExecCoreOptions } from './exec';
import { SharedVolume } from './services/shared-fs';



abstract class ProcessBase extends EventEmitter {

    opts: ProcessStartupOptions

    stdin:  TransformStreamDuplex<string, BufferSource>
    stdout: TransformStreamDuplex<BufferSource, string>

    stdin_raw: SimplexStream
    tty: TtyProps
    sigvec: SignalVector
    childq: ChildProcessQueue

    exited: boolean

    constructor(opts: ProcessStartupOptions) {
        super();
        this.opts = opts;
        
        if (this.setupEncoder()) {
            this.stdout = new TransformStreamDuplex(new TextDecoderStream());
        }
        else if (typeof process !== 'undefined' && process.stdin) {
            process.stdin.on('data', buf => this.stdin_raw.write(buf));
            this.stdout = <any>process.stdout;
        }

        this.on('exit', () => this.exited = true);
    }

    abstract exec(wasm: string, argv?: string[]): void;

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
    
    reset() {
        this.exited = false;
        this.stdin_raw.reset();
        this.setupEncoder();
    }

    setupEncoder() {
        if (typeof TextEncoderStream !== 'undefined') {
            this.stdin = new TransformStreamDuplex(new TextEncoderStream());
            this.stdin.on('data', bytes => this.stdin_raw.write(bytes));
            this.stdin.on('end', () => this.stdin_raw.end());
            return true;
        }
        else return false;
    }

}


/**
 * Suitable for running a WASI process in a Web Worker or
 * a Node.js worker thread.
 */
class WorkerProcess extends ProcessBase {

    worker : Worker

    constructor(wasm: string, opts: ProcessStartupOptions={}) {
        super(opts);
        this.worker = new Worker(new URL('./worker.ts', import.meta.url));
        this.worker.addEventListener('message', ev => {
            if (ev.data.stdin)  this.stdin_raw = SimplexStream.from(ev.data.stdin);
            if (ev.data.tty)    this.tty = ev.data.tty;
            if (ev.data.sigvec) this.sigvec = SignalVector.from(ev.data.sigvec);
            if (ev.data.childq) this.childq = SharedQueue.from(ev.data.childq);
            if (ev.data.fd)     this.stdout.write(ev.data.data);

            if (ev.data.event)  this.emit(ev.data.event, ev.data.arg, wasm);
        });

        if (wasm) this.exec(wasm);
    }

    mountFs(volume: SharedVolume) {
        this.worker.postMessage({volume: volume.to()});
        return this;
    }

    exec(wasm: string, argv?: string[]) {
        if (this.exited) this.reset();
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

    async exec(wasm: string, argv?: string[]) {
        const {ExecCore} = await import('./exec');  // on-demand import

        this.core = new ExecCore({argv, ...this.opts});
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



export { ProcessBase, WorkerProcess, BareProcess, ProcessStartupOptions }
