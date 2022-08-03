import { EventEmitter } from 'events';
import assert from 'assert';
import { isBrowser, isWebWorker } from 'browser-or-node';
import { IFs, createFsFromVolume } from 'memfs';

// Importing Wasmer-js from `/lib` avoids some code duplication in
// generated bundle (esp. `memfs`).
import { WASI, WASIConfig } from '@wasmer/wasi/lib';
import { WasmFs } from '@wasmer/wasmfs/lib';
//import * as transformer from '@wasmer/wasm-transformer';

import { SimplexStream } from './streams';
import { Tty } from './bits/tty';
import { Proc, ProcOptions } from './bits/proc';
import stubs from './bits/stubs';

import { utf8encode, utf8decode } from './bindings/utf8';
import { SharedVolume } from './services/shared-fs';

WASI.defaultBindings = (isBrowser || isWebWorker)
              ? require("@wasmer/wasi/lib/bindings/browser").default
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

    cached: Map<string, Promise<WebAssembly.Module>> /* cached binaries */

    debug: (...args: any) => void = nop
    trace: {user: (ui8a: Uint8Array) => void,
            syscalls: (...args: any) => void} = {user: nop, syscalls: nop}

    constructor(opts: ExecCoreOptions = {}) {
        super();
        this.opts = opts = Object.assign({}, defaults, opts);
        
        // Configure envrionment
        this.stdin = opts.stdin ? new SimplexStream() : null;
        this.wasmFs = new WasmFs();

        this.populateRootFs();

        this.proc = new Proc(this, opts.proc);
        this.tty = opts.tty ? new Tty(this) : null;
        this.cached = (opts.cacheBins !== false) ? new Map() : null;

        this.init();
    }

    initTraces() {
        // Debug prints
        if (this.opts.debug) {
            this.debug = this._debugPrint();
            this.trace.user = this._tracePrint();
        }
        if (this.opts.trace?.syscalls) {
            this.trace.syscalls = this._tracePrintAny();
        }
        if (this.tty)
            this.tty.debug = (...a) => this.debug(...a);
        this.proc.debug = (...a) => this.debug(...a);

        stubs.debug = this.debug; // global :(
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
            preopens: {'/': '/'},
            ...this.extraWASIConfig()
        });
        this.exited = false;

        this.registerStdio();
        this.proc.init();

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

    configure(opts: ExecCoreOptions) {
        /** @todo reset if needed */
        Object.assign(this.opts, opts);
    }

    reset() {
        if (this.stdin) this.stdin.reset();
        this.init();
    }

    async start(wasmUri: string, argv?: string[], env?: {}) {
        if (this.exited) this.reset();

        if (argv) this.argv.splice(0, Infinity, ...argv);
        if (env)  Object.assign(this.env, env);
        this.proc.opts = this.opts.proc || {}; // in case new options where set
        this.initTraces();

        // Fetch Wasm binary and instantiate WebAssembly instance
        var wamodule = await this.fetchCompile(wasmUri),
            wainstance = await WebAssembly.instantiate(wamodule,
                this.getImports(wamodule));
        
        this.wasm = {module: wamodule, instance: wainstance};
    
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

    get fs(): IFs { return this.wasmFs.fs; }

    async fetch(uri: string) {
        switch (this.opts.fetchMode) {
        case 'browser':
            const response = await fetch(uri);
            return new Uint8Array(await response.arrayBuffer());
        case 'fs':
            const fs = require('fs');
            return (0||fs.readFileSync)(uri);  // bypass Parcel
        default:
            assert(false, `unknown fetch mode '${this.opts.fetchMode}'`);
        }
    }

    async fetchCompile(uri: string) {
        return memoizeMaybe(this.cached, uri, async (uri: string) => {
            var bytes = await this.fetch(uri);
            /** @todo maybe use `wasm-feature-detect` to run the transformer */
            /** on demand depending on runtime support? */
            //bytes = await transformer.lowerI64Imports(bytes);
            return WebAssembly.compile(bytes);
        });
    }

    /**
     * @todo warn about unresolved symbols such as `__SIG_IGN` that stem
     *    from not linking some wasi-sdk emulation lib (`-lwasi-emulated-signal`).
     */
    getImports(wamodule: WebAssembly.Module) {
        return {
            ...this.wasi.getImports(wamodule),
            wasik_ext: {...this.proc.extlib, ...this.tty?.extlib},
            env: {...this.proc.import, ...this.tty?.import}
        };
    }

    /**
     * Returns an object that can be shared with a parent thread
     * (via e.g. `Worker.postMessage`) to communicate with this core.
     */
    share(): any {
        return {
            stdin: this.stdin.to(),
            tty: this.tty.to(),
            sigvec: this.proc.sigvec.to(),
            childq: this.proc.childq.to()
        };
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
        return {PATH: '/bin', PWD: '/home'};
    }

    extraWASIConfig(): WASIConfig {
        let o = this.opts;
        return {traceSyscalls: o.trace && o.trace.syscalls}
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

        if (this.stdin)
            volume.fds[0].read = this.stdin.read.bind(this.stdin);
        volume.fds[1].write = d => this.emitWrite(1, d);
        volume.fds[2].write = d => this.emitWrite(2, d);
    }

    mountFs(volume: SharedVolume) {
        volume.fromJSON(this.wasmFs.volume.toJSON());
        this.wasmFs.volume = volume;
        this.wasmFs.fs = createFsFromVolume(volume);
        // must recreate WASI now
        this.init();
    }

    /**
     * Bootstrapping filesystem contents
     */
    populateRootFs() {
        this.wasmFs.fs.mkdirSync("/home");
        this.wasmFs.fs.mkdirSync("/bin");
    }

    _debugPrint() {
        return (global.process) ? /* console is funky in Node worker threads */
            (...args: any) => this.emitWrite(2, utf8encode(args.join(" ")+'\n'))
          : console.log;
    }

    _tracePrint() {
        return (global.process) ? /* console is funky in Node worker threads */
            (ui8a: Uint8Array) => this.emitWrite(2, ui8a)
          : (ui8a: Uint8Array) => console.warn('[trace]', utf8decode(ui8a), ui8a);
    }

    _tracePrintAny() {
        return (global.process) ? /* console is funky in Node worker threads */
            (...args: any) => this.emitWrite(2, utf8encode(args.toString()))
          : (...args: any) => console.warn('[trace]', ...args);
    }
}

type ExecCoreOptions = {
    stdin? : boolean,
    tty? : boolean | number | [number],
    proc?: ProcOptions,
    env?: Environ,
    fetchMode?: FetchMode,
    cacheBins?: boolean,
    debug?: boolean,
    trace?: {syscalls?: boolean}
};

type Environ = {[k: string]: string};
type FetchMode = 'browser' | 'fs';

const defaults: ExecCoreOptions = {
    stdin: true,
    fetchMode: (isBrowser || isWebWorker) ? 'browser' : 'fs'
};

const nop = () => {};
declare var window: any;


function memoize<K, V>(cache: Map<K, V>, k: K, f: (k: K) => V) {
    let v = cache.get(k);
    if (!v) {
        v = f(k);
        cache.set(k, v);
    }
    return v;
}

function memoizeMaybe<K, V>(cache: Map<K, V>, k: K, f: (k: K) => V) {
    return cache ? memoize(cache, k, f) : f(k);
}


/**
 * `@wasmer/wasi` exports this class as ES5  :/
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
