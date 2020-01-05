import { EventEmitter } from 'events';
import assert from 'assert';
import { WASI } from '@wasmer/wasi/lib';
import { WasmFs } from '@wasmer/wasmfs';
import * as transformer from '@wasmer/wasm-transformer';

import { SimplexStream } from './streams';
import { Tty } from './bits/tty';
import { Proc } from './bits/proc';

import { utf8encode } from './bindings/utf8';
import { isBrowser } from '../infra/arch';

WASI.defaultBindings =
    isBrowser ? require("@wasmer/wasi/lib/bindings/browser").default
              : require("@wasmer/wasi/lib/bindings/node").default;



class ExecCore extends EventEmitter {

    opts: ExecCoreOptions
    stdin: SimplexStream
    wasmFs: WasmFs
    env: Environ
    argv: string[]
    wasi: WASI
    wasm: WebAssembly.WebAssemblyInstantiatedSource
    stdioFds: any[]

    tty: Tty
    proc: Proc

    exited: boolean

    cached: Map<string, Uint8Array> /* cached binaries */

    debug: (...args: any) => void

    constructor(opts: ExecCoreOptions = {}) {
        super();
        this.opts = opts;
        
        // Configure envrionment
        this.stdin = new SimplexStream();
        this.wasmFs = new WasmFs();

        this.populateRootFs();

        this.proc = new Proc(this);
        this.tty = new Tty(this);
        this.cached = new Map();

        this.init();
        
        // Debug prints
        // @ts-ignore
        this.debug = (global.process) ? /* console is funky in Node worker threads */
             (...args: any) => this.emitWrite(2, utf8encode(args.join(" ")+'\n'))
           : console.log;
        this.tty.debug = this.debug;
        this.proc.debug = this.debug;
    }

    init() {
        this.argv = ['.'];
        this.env = this.initialEnv();

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
            preopenDirectories: {'/': '/', '.': '.'}
        });
        this.exited = false;

        this.registerStdio();

        // Initialize tty (for streaming stdin)
        let tty = this.opts.tty;
        if (tty) {
            var fds = (typeof tty == 'number') ? [tty]
                    : (typeof tty == 'boolean') ? [0,1,2] : tty;
            this.tty.fds = fds;
            for (let fd of fds)
                this.tty.makeTty(fd);
        }
    }

    async start(wasmUri: string, argv?: string[], env?: {}) {
        if (this.exited) this.init();

        if (argv) this.argv.splice(0, Infinity, ...argv);
        if (env)  Object.assign(this.env, env);

        // Fetch Wasm binary and instantiate WebAssembly instance
        var bytes = await this.fetch(wasmUri);
        
        bytes = await transformer.lowerI64Imports(bytes);

        this.wasm = await WebAssembly.instantiate(bytes, {
            wasi_unstable: {...this.wasi.wasiImport, ...this.tty.overrideImport},
            env: {...this.proc.import, ...this.tty.import}
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
        finally {
            this.exited = true;
        }
    }

    async fetch(uri: string) {
        var c = this.cached.get(uri);
        if (c) return c;
        else if (typeof fetch !== 'undefined') {
            const response = await fetch(uri);
            c = new Uint8Array(await response.arrayBuffer());
            this.cached.set(uri, c);
            return c;
        }
        else {
            const fs = require('fs');
            return (0||fs.readFileSync)(uri);  // bypass Parcel
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
    initialEnv() {
        return this.opts.env ? Object.assign({}, this.opts.env) 
                             : this.defaultEnv();
    }

    defaultEnv() {
        return {PATH: '/bin', CWD: '/home'};
    }

    registerStdio() {
        var volume = this.wasmFs.volume;

        if (!(volume.fds[0] && volume.fds[1] && volume.fds[2])) {
            // stdio fds have been closed. re-init
            volume.releasedFds = [0, 1, 2];
            const fdErr = volume.openSync("/dev/stderr", "w"),
                  fdOut = volume.openSync("/dev/stdout", "w"),
                  fdIn = volume.openSync("/dev/stdin", "r");
            assert(fdIn == 0 && fdOut == 1 && fdErr == 2);
        }

        volume.fds[0].read = this.stdin.read.bind(this.stdin);
        volume.fds[1].write = d => this.emitWrite(1, d);
        volume.fds[2].write = d => this.emitWrite(2, d);
    }

    /**
     * Bootstrapping filesystem contents
     */
    populateRootFs() {
        this.wasmFs.fs.mkdirSync("/home");
        this.wasmFs.fs.writeFileSync("/home/a", "data");
        this.wasmFs.fs.mkdirSync("/bin");
        this.wasmFs.fs.writeFileSync("/bin/ls", '#!wasi\n{"uri":"busy.wasm"}');
        this.wasmFs.fs.writeFileSync("/bin/cat", '#!wasi\n{"uri":"busy.wasm"}');
        this.wasmFs.fs.writeFileSync("/bin/touch", '#!wasi\n{"uri":"busy.wasm"}');
        this.wasmFs.fs.writeFileSync("/bin/mkdir", '#!wasi\n{"uri":"busy.wasm"}');
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
export class WASIExitError /* extends Error*/ {
    code: number | null;
    constructor(code: number | null) {
        //super(`WASI Exit error: ${code}`);
        this.code = code;
    }
}


export {ExecCore, Environ, ExecCoreOptions}
