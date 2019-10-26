import { EventEmitter } from 'events';
import WASI from '@wasmer/wasi';
import { WasmFs } from '@wasmer/wasmfs';
import { Stdin, TransformStreamDuplex } from './streams';



class Process extends EventEmitter {

    constructor(js, wasm) {
        super();
        
        this.worker = new Worker(js);
        this.worker.addEventListener('message', ev => {
            if (ev.data.stdin) this.stdin_raw = Stdin.from(ev.data.stdin);
            if (ev.data.fd) this.stdout.write(ev.data.data);
        });

        this.stdin = new TransformStreamDuplex(new TextEncoderStream());
        this.stdin.on('data', bytes => this.stdin_raw.write(bytes));

        this.stdout = new TransformStreamDuplex(new TextDecoderStream());
        this.stdout.on('data', console.log);

        if (wasm) this.exec(wasm);
    }

    exec(wasm) {
        this.worker.postMessage({exec: wasm});
    }
    
}


class ExecCore extends EventEmitter {

    constructor(opts={}) {
        super();

        this.emit('out');

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
                    : (typeof opts.tty == 'boolean') ? [1] : opts.tty;
            for (let fd of fds)
                this.makeTty(fd);
        }
    }


    async start(wasmUri) {
        // Fetch Wasm binary and instantiate WebAssembly instance
        const response = await fetch(wasmUri);
        const bytes = await response.arrayBuffer();
        
        this.wasm = await WebAssembly.instantiate(bytes, {
            wasi_unstable: this.wasi.wasiImport
        });
    
        // Start the WebAssembly WASI instance!
        this.wasi.start(this.wasm.instance);
    }
    
    makeTty(fd) {
        // Make isatty(fd) return `true`
        this.wasi.FD_MAP.get(fd).filetype = 2;
        this.wasi.FD_MAP.get(fd).rights.base &= ~BigInt(0x24);
    }

    emitWrite(fd, buffer) {
        this.emit('stream:out', {fd: fd, data: buffer});
        return buffer.length;
    }
}


export {Process, ExecCore}


