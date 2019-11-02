import { EventEmitter } from 'events';
import WASI from '@wasmer/wasi';
import { WasmFs } from '@wasmer/wasmfs';
import { lowerI64Imports } from "@wasmer/wasm-transformer";

import { Stdin, TransformStreamDuplex } from './streams';
import { Tty } from './bits/tty';
import { Proc, SignalVector, ChildProcessQueue } from './bits/proc';

import { Worker } from './bindings/workers';
import { utf8encode } from './bindings/utf8';
import { SharedQueue } from './bits/queue';


abstract class ProcessBase extends EventEmitter {

    stdin:  TransformStreamDuplex
    stdout: TransformStreamDuplex

    stdin_raw: Stdin
    sigvec: SignalVector
    childq: ChildProcessQueue

    constructor() {
        super();
        
        if (typeof TextEncoderStream !== 'undefined') {
            this.stdin = new TransformStreamDuplex(new TextEncoderStream());
            this.stdin.on('data', bytes => this.stdin_raw.write(bytes));

            this.stdout = new TransformStreamDuplex(new TextDecoderStream());
            this.stdout.on('data', console.log);
        }
        else if (typeof process !== 'undefined') {
            process.stdin.on('data', buf => this.stdin_raw.write(buf));
            this.stdout = <any>process.stdout;
        }
    }

    abstract exec(wasm: string): void;
}


/**
 * Suitable for running a WASI process in a Web Worker or
 * a Node.js worker thread.
 */
class WorkerProcess extends ProcessBase {

    worker : Worker

    constructor(wasm : string, workerJs : string) {
        super();
        
        this.worker = new Worker(workerJs);
        this.worker.addEventListener('message', ev => {
            if (ev.data.stdin)  this.stdin_raw = Stdin.from(ev.data.stdin);
            if (ev.data.sigvec) this.sigvec = SignalVector.from(ev.data.sigvec);
            if (ev.data.childq) this.childq = SharedQueue.from(ev.data.childq);
            if (ev.data.fd)     this.stdout.write(ev.data.data);

            if (ev.data.event)  this.emit(ev.data.event, ev.data.arg, wasm);

            if (ev.data.event === 'spawn') {
                // Emulate subprocess 1 exiting (for testing)
                setTimeout(() => {
                    console.log("- wake rainbow -");
                    this.childq.enqueue(ev.data.arg.pid);
                }, 1000);
            }
        });

        if (wasm) this.exec(wasm);
    }

    exec(wasm: string) {
        this.worker.postMessage({exec: wasm});
    }
}


class BareProcess extends ProcessBase {

    core: ExecCore;

    constructor(wasm: string) {
        super();
        this.exec(wasm);
    }

    exec(wasm: string) {
        this.core = new ExecCore({tty: true});
        this.core.on('stream:out', ev => process.stdout.write(ev.data));
        this.core.start(wasm).catch(err => {
            this.emit('error', err, wasm);
        });
    }
}


class ExecCore extends EventEmitter {

    stdin: Stdin
    wasmFs: WasmFs
    env: Environ
    wasi: WASI
    wasm: WebAssembly.WebAssemblyInstantiatedSource

    tty: Tty
    proc: Proc

    debug: (...args: any) => void

    constructor(opts: ExecCoreOptions = {}) {
        super();
        
        // Configure envrionment
        this.stdin = new Stdin();
        this.wasmFs = new WasmFs();

        this.wasmFs.volume.fds[0].read = this.stdin.read.bind(this.stdin);
        this.wasmFs.volume.fds[1].write = d => this.emitWrite(1, d);
        this.wasmFs.volume.fds[2].write = d => this.emitWrite(2, d);

        this.populateRootFs();
        this.env = opts.env || this.defaultEnv();

        this.proc = new Proc(this);

        // Instantiate a new WASI Instance
        this.wasi = new WASI({
            args: ['.'],
            env: this.env,
            bindings: {
                ...WASI.defaultBindings,
                fs: this.wasmFs.fs,
                path: this.proc.path
            },
            preopenDirectories: {'/': '/'}
        });
        
        // Initialize tty (for streaming stdin)
        this.tty = new Tty(this.wasi, this.stdin);

        if (opts.tty) {
            var fds = (typeof opts.tty == 'number') ? [opts.tty]
                    : (typeof opts.tty == 'boolean') ? [0,1,2] : opts.tty;
            for (let fd of fds)
                this.tty.makeTty(fd);
        }

        // Debug prints
        this.debug = (...args: any) => this.emitWrite(2, utf8encode(args.join(" ")+'\n'));
        this.tty.debug = this.debug;
        this.proc.debug = this.debug;
    }

    async start(wasmUri: string) {
        // Fetch Wasm binary and instantiate WebAssembly instance
        var bytes = await this.fetch(wasmUri);
        
        bytes = await lowerI64Imports(bytes);

        this.wasm = await WebAssembly.instantiate(bytes, {
            wasi_unstable: {...this.wasi.wasiImport, ...this.tty.import},
            env: this.proc.import
        });
    
        // Start the WebAssembly WASI instance
        this.wasi.start(this.wasm.instance);
    }

    async fetch(uri: string) {
        if (typeof fetch !== 'undefined') {
            const response = await fetch(uri);
            return new Uint8Array(await response.arrayBuffer());
        }
        else {
            const fs = require('fs');
            return fs.readFileSync(uri);
        }
    }

    /**
     * Returns an object that can be shared with a parent thread
     * (via e.g. Worker.postMessage) to communicate with this core.
     */
    share(): any {
        return {stdin: this.stdin.to(),
            sigvec: this.proc.sigvec.to(), childq: this.proc.childq.to()};
    }
    
    emitWrite(fd: number, buffer: Buffer | Uint8Array) {
        this.emit('stream:out', {fd: fd, data: buffer});
        return buffer.length;
    }

    /**
     * Initial environment variables
     */
    defaultEnv() {
        return {PATH: '/bin', CWD: '/home'};
    }

    /**
     * Bootstrapping filesystem contents
     */
    populateRootFs() {
        this.wasmFs.fs.mkdirSync("/home");
        this.wasmFs.fs.writeFileSync("/home/a", "data");
        this.wasmFs.fs.mkdirSync("/bin");
        this.wasmFs.fs.writeFileSync("/bin/ls", '#!wasi\n{"uri":"busy.wasm"}');
    }
}

type ExecCoreOptions = {
    tty? : boolean | number | [number],
    funcTableSz? : number,
    env?: Environ
};

type Environ = {[k: string]: string};


export { WorkerProcess, BareProcess, ExecCore }
