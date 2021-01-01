import { EventEmitter } from 'events';
import assert from 'assert';
import { WASI, WASIConfig } from '@wasmer/wasi';
import { WasmFs } from '@wasmer/wasmfs';
import * as transformer from '@wasmer/wasm-transformer';
import { IFs, createFsFromVolume } from 'memfs';

import { SimplexStream } from './streams';
import { Tty } from './bits/tty';
import { Proc } from './bits/proc';

import { utf8encode, utf8decode } from './bindings/utf8';
import { isBrowser } from '../infra/arch';
import { SharedVolume } from './services/shared-fs';

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

    cached: Map<string, Promise<WebAssembly.Module>> /* cached binaries */

    debug: (...args: any) => void
    trace: (ui8a: Uint8Array) => void

    constructor(opts: ExecCoreOptions = {}) {
        super();
        this.opts = opts = Object.assign({}, defaults, opts);
        
        // Configure envrionment
        this.stdin = opts.stdin ? new SimplexStream() : null;
        this.wasmFs = new WasmFs();

        this.populateRootFs();

        this.proc = new Proc(this);
        this.tty = opts.tty ? new Tty(this) : null;
        this.cached = (opts.cacheBins !== false) ? new Map() : null;

        this.init();
        
        // Debug prints
        if (this.opts.debug) {
            this.debug = this._debugPrint();
            this.trace = this._tracePrint();
        }
        else {
            this.debug = this.trace = () => {};
        }
        if (this.tty)
            this.tty.debug = (...a) => this.debug(...a);
        this.proc.debug = (...a) => this.debug(...a);
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
            preopens: {'/': '/', '.': '.'},
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

    reset() {
        if (this.stdin) this.stdin.reset();
        this.init();
    }

    async start(wasmUri: string, argv?: string[], env?: {}) {
        if (this.exited) this.reset();

        if (argv) this.argv.splice(0, Infinity, ...argv);
        if (env)  Object.assign(this.env, env);

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
        if (typeof fetch !== 'undefined') {
            const response = await fetch(uri);
            return new Uint8Array(await response.arrayBuffer());
        }
        else {
            const fs = require('fs');
            return (0||fs.readFileSync)(uri);  // bypass Parcel
        }
    }

    async fetchCompile(uri: string) {
        return memoizeMaybe(this.cached, uri, async (uri: string) => {
            var bytes = await this.fetch(uri);
            bytes = await transformer.lowerI64Imports(bytes);
            return WebAssembly.compile(bytes);
        });
    }

    getImports(wamodule: WebAssembly.Module) {
        // @fixme should really use WASI.getImports(), but it gets confused
        //   by the presence of the wasi_ext namespace
        var ns = new Set<string>(), imports = {};
        for (let imp of WebAssembly.Module.imports(wamodule)) {
            if (imp.module.startsWith('wasi_') && imp.module !== 'wasi_ext')
                ns.add(imp.module);
        }
        for (let nm of ns) {
            imports[nm] = this.wasi.wasiImport;
        }
        imports['wasi_ext'] = {...this.proc.extlib, ...(this.tty ? this.tty.extlib : {})};
        imports['env'] = {...this.proc.import, ...(this.tty ? this.tty.import : {})};
        return imports;
    }

    /**
     * Returns an object that can be shared with a parent thread
     * (via e.g. Worker.postMessage) to communicate with this core.
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
        // @ts-ignore until @wasmer/wasi 0.12
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
          : (ui8a: Uint8Array) => console.warn('[trace]', ui8a, utf8decode(ui8a));
    }
}

type ExecCoreOptions = {
    stdin? : boolean,
    tty? : boolean | number | [number],
    funcTableSz? : number,
    env?: Environ,
    cacheBins?: boolean,
    debug?: boolean,
    trace?: {syscalls?: boolean}
};

type Environ = {[k: string]: string};

const defaults: ExecCoreOptions = {stdin: true};


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
