import { EventEmitter } from 'events';
import { WASI } from '@wasmer/wasi';
import { WasmFs } from '@wasmer/wasmfs';
import * as transformer from '@wasmer/wasm-transformer';

import { Stdin } from './streams';
import { Tty } from './bits/tty';
import { Proc } from './bits/proc';

import { utf8encode } from './bindings/utf8';



class ExecCore extends EventEmitter {

    stdin: Stdin
    wasmFs: WasmFs
    env: Environ
    argv: string[]
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
        this.argv = ['.'];

        this.proc = new Proc(this);

        // Instantiate a new WASI Instance
        this.wasi = new WASI({
            args: this.argv,
            env: this.env,
            bindings: {
                ...WASI.defaultBindings,
                exit: code => { throw new WASIExitError(code) },
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
        // @ts-ignore
        this.debug = (ROLLUP_IS_NODE) ?
             (...args: any) => this.emitWrite(2, utf8encode(args.join(" ")+'\n'))
           : console.log;
        this.tty.debug = this.debug;
        this.proc.debug = this.debug;
    }

    async start(wasmUri: string, argv?: string[]) {
        // Fetch Wasm binary and instantiate WebAssembly instance
        var bytes = await this.fetch(wasmUri);
        
        bytes = await transformer.lowerI64Imports(bytes);

        if (argv) this.argv.splice(0, Infinity, ...argv);

        this.wasm = await WebAssembly.instantiate(bytes, {
            wasi_unstable: {...this.wasi.wasiImport, ...this.tty.import},
            env: this.proc.import
        });
    
        // Start the WebAssembly WASI instance
        try {
            this.wasi.start(this.wasm.instance);
            return 0;
        }
        catch (e) {
            if (e instanceof WASIExitError) return e.code;
            else throw e;
        }
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


/**
 * @wasmer/wasi export this class as ES5  :/
 * This kills instanceof. So redefining it here. -_-
 */
export class WASIExitError extends Error {
    code: number | null;
    constructor(code: number | null) {
        super(`WASI Exit error: ${code}`);
        this.code = code;
    }
}


export {ExecCore, Environ, ExecCoreOptions}
