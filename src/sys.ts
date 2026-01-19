import * as wasmer from "@wasmer/sdk";
import { init, Runtime, Wasmer } from "@wasmer/sdk";

import { ChildProcess } from './services/task-mgr';

//let window = {};

const wasmBindgenUrl = 'node_modules/@wasmer/sdk/dist/wasmer_js_bg.wasm';
const sdkUrl = 'node_modules/@wasmer/sdk/dist/index.mjs';
//const workerUrl = '/node_modules/@wasmer/sdk/dist/worker.mjs';
const workerUrl = "bootstrap/src/worker.js"


class System {

    uris: {
        wasmBindgen: string,
        sdk: string,
        worker: string
    }

    rt: Runtime
    vfs: {[dir: string]: wasmer.Directory}
    cwd: string
    env: {[varname: string]: string}

    constructor(uris: string | URL | System['uris']) {
        if (typeof uris === 'string') uris = this._url(uris);
        if (uris instanceof URL) uris = {
            wasmBindgen: new URL(wasmBindgenUrl, uris).href,
            sdk: new URL(sdkUrl, uris).href,
            worker: new URL(workerUrl, uris).href
        }
        this.uris = uris;
    }

    async startup() {
        await init({module: this.uris.wasmBindgen});
        wasmer.setSDKUrl(this.uris.sdk);
        wasmer.setWorkerUrl(this.uris.worker);

        this.rt = new Runtime();

        // Default setup
        this.vfs = {'/usr': new wasmer.Directory, '/home': new wasmer.Directory};
        this.cwd = '/usr';
        this.env = {'PATH': '/usr/bin', 'HOME': '/home'};
    }


    async runWasix(bin: Uint8Array | ArrayBuffer | URL | string, runOpts: wasmer.RunOptions) {
        if (!this.rt) await this.startup();

        bin = await this._bin(bin);

        let instance = await wasmer.runWasix(bin, {
            runtime: this.rt,   /** @todo one runtime per process for tty control? */
            mount: this.vfs,
            cwd: this.cwd,
            env: this.env,
            ...runOpts, 
        });
        return new ChildProcess(instance);
    }

    async _bin(bin: string | URL | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
        if (typeof bin === 'string')
            return await this.vfs['/usr'].readFile(bin);  /** @todo `usr` is currently hard-coded */
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