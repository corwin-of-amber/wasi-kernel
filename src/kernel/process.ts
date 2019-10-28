import { EventEmitter } from 'events';
import WASI from '@wasmer/wasi';
import { WasmFs } from '@wasmer/wasmfs';
import { Stdin, TransformStreamDuplex } from './streams';

import { Worker } from './bindings/workers';


abstract class ProcessBase extends EventEmitter {

    stdin : TransformStreamDuplex
    stdout : TransformStreamDuplex

    stdin_raw : Stdin

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


class WorkerProcess extends ProcessBase {

    worker : Worker

    constructor(wasm : string, workerJs : string) {
        super();
        
        this.worker = new Worker(workerJs);
        this.worker.addEventListener('message', ev => {
            if (ev.data.stdin) this.stdin_raw = Stdin.from(ev.data.stdin);
            if (ev.data.fd)    this.stdout.write(ev.data.data);
            if (ev.data.error) this.emit('error', ev.data.error, wasm);
            if (ev.data.exit)  this.emit('exit', ev.data.exit);
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
    wasi: WASI
    wasm: WebAssembly.WebAssemblyInstantiatedSource

    constructor(opts: ExecCoreOptions = {}) {
        super();
        
        // Configure envrionment
        this.stdin = new Stdin();
        this.wasmFs = new WasmFs();

        this.wasmFs.volume.fds[0].read = this.stdin.read.bind(this.stdin);
        this.wasmFs.volume.fds[1].write = d => this.emitWrite(1, d);
        this.wasmFs.volume.fds[2].write = d => this.emitWrite(2, d);

        // Instantiate a new WASI Instance
        this.wasi = new WASI({
          args: [],
          env: {},
          bindings: {
            ...WASI.defaultBindings,
            fs: this.wasmFs.fs
          }
        });
        
        if (opts.tty) {
            var fds = (typeof opts.tty == 'number') ? [opts.tty]
                    : (typeof opts.tty == 'boolean') ? [0,1,2] : opts.tty;
            for (let fd of fds)
                this.makeTty(fd);
        }
    }

    async start(wasmUri: string) {
        // Fetch Wasm binary and instantiate WebAssembly instance
        const bytes = await this.fetch(wasmUri);
        
        this.wasm = await WebAssembly.instantiate(bytes, {
            wasi_unstable: this.wasi.wasiImport
        });
    
        // Start the WebAssembly WASI instance!
        this.wasi.start(this.wasm.instance);
    }

    async fetch(uri: string) {
        if (typeof fetch !== 'undefined') {
            const response = await fetch(uri);
            return await response.arrayBuffer();
        }        
        else {
            const fs = require('fs');
            return fs.readFileSync(uri);
        }
    }
    
    makeTty(fd: number) {
        // Make isatty(fd) return `true`
        this.wasi.FD_MAP.get(fd).filetype = 2;
        this.wasi.FD_MAP.get(fd).rights.base &= ~BigInt(0x24);
    }

    emitWrite(fd: number, buffer: Buffer | Uint8Array) {
        this.emit('stream:out', {fd: fd, data: buffer});
        return buffer.length;
    }
}

type ExecCoreOptions = {
    tty? : boolean | number | [number]
};



export { WorkerProcess, BareProcess, ExecCore }

