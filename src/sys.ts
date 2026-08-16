import * as wasmer from "@wasmer/sdk";
import { init, WasmerInitInput } from "@wasmer/sdk";

import { ChildProcess, DirectoryVolumeAdapter, InitProcess } from './services';



const DEFAULT_URIS = {
    wasmBindgen: 'node_modules/@wasmer/sdk/dist/wasmer_js_bg.wasm',
    sdk: 'node_modules/@wasmer/sdk/dist/index.mjs',
    worker: 'dist/worker.mjs'
};


class System {

    uris: {
        wasmBindgen: string,
        sdk: string,
        worker: string
    }

    init: InitProcess
    mem: WebAssembly.Memory
    vfs: DirectoryVolumeAdapter
    cwd: string
    env: {[varname: string]: string}

    constructor(uris: string | URL | System['uris']) {
        if (typeof uris === 'string' || uris instanceof URL)
            uris = this.defaultURIs(uris);
        this.uris = uris;
    }

    async startup(initOptions: WasmerInitInput = {}) {
        let iin = {
            module: this.uris.wasmBindgen, 
            sdkUrl: this.uris.sdk,
            workerUrl: this.uris.worker,
            ...initOptions
        };

        let iout = await init(iin);
        this.mem = iout.memory;

        this.init = new InitProcess(iin, this.mem);

        // Default setup
        this.vfs = new DirectoryVolumeAdapter(new wasmer.Directory);
        for (let d of ['/home', '/usr/bin'])
            await this.vfs.mkdir(d, {recursive: true});
        this.cwd = '/home';
        this.env = {'PATH': '/usr/bin', 'HOME': '/home'};
    }


    async runWasix(bin: Uint8Array | ArrayBuffer | URL | string, runOpts: wasmer.RunOptions) {
        if (!this.init) await this.startup();

        bin = await this._bin(bin);

        let instance = await this.init.spawn(bin, {
            mount: this.vfs.mounts,
            cwd: this.cwd,
            env: this.env,
            ...runOpts, 
        });
        return new ChildProcess(instance);
    }

    /**
     * Create a configuration using the default layout relative to a given
     * base URI.
     */
    defaultURIs(baseURI: string | URL) {
        let b = this._url(baseURI), d = DEFAULT_URIS;
        return {
            wasmBindgen: new URL(d.wasmBindgen, b).href,
            sdk: new URL(d.sdk, b).href,
            worker: new URL(d.worker, b).href
        };
    }

    async _bin(bin: Uint8Array | ArrayBuffer | URL | string): Promise<Uint8Array | ArrayBuffer> {
        if (typeof bin === 'string')
            return await this.vfs.readFile(bin);
        else if (bin instanceof URL)
            return await (await fetch(bin)).arrayBuffer();
        else
            return bin;
    }

    _url(s: string | URL) {
        return (typeof s === 'string') ? new URL(s, new URL(window.location.href)) : s;
    }
}


export { System }