import fs from 'fs';
import path from 'path';
import * as wasmer from "@wasmer/sdk";
import { init, Runtime, Wasmer, WasmerInitInput } from "@wasmer/sdk";

import { MiniTerm } from './miniterm.ts';

import { ChildProcess } from '../../src/services/task-mgr.ts';

//let window = {};

const wasmBindgenUrl = '/node_modules/@wasmer/sdk/dist/wasmer_js_bg.wasm';
const sdkUrl = '/node_modules/@wasmer/sdk/dist/index.mjs';
//const workerUrl = '/node_modules/@wasmer/sdk/dist/worker.mjs';
const workerUrl = "/src/worker.js"

/**
 * That's a minimal version for testing (full version in `sys.ts`)
 */
class InitProcess {
    worker: Worker

    constructor(init: WasmerInitInput, memory?: WebAssembly.Memory) {
        this.worker = new Worker(init.workerUrl, {name: 'wasik-init'});
        this.worker.postMessage({type: 'init', ...init, memory});
    }

    spawn(bin: Uint8Array | WebAssembly.Module, runOpts: any = {}) {
        let chan = new MessageChannel();
        this.worker.postMessage({type: 'spawn', mode: 'wasix', bin, runOpts,
            port: chan.port2}, [chan.port2]);

        return new Promise<wasmer.Instance>(resolve => {
            chan.port1.addEventListener('message', m => resolve(m.data));
            chan.port1.start();
        });
    }
}

async function main() {

    let iout = await init({module: wasmBindgenUrl, log: "trace"});
    wasmer.setSDKUrl(sdkUrl);
    wasmer.setWorkerUrl(workerUrl);

    var term = new MiniTerm(document.querySelector('#term'));

    let vfs = new wasmer.Directory();
    await vfs.createDir('/home');
    await vfs.createDir('/home/share');
    await vfs.writeFile('/home/share/a.ml', '- x -');
    await vfs.writeFile('/home/share/b.ml', '---');
    await vfs.writeFile('/home/a.lean', 'prelude\n\ninductive A where\n');
    await vfs.createDir('/usr');
    await vfs.createDir('/usr/bin');
    for (let exe of ['hello', 'stdin']) {
        try {
            await vfs.writeFileRO(`/usr/bin/${exe}`, new Uint8Array(fs.readFileSync(`${exe}.wasm`)));
        }
        catch (e) { console.warn(`${exe}.wasm`, e); }
    }
    await vfs.createDir('/dev');
    await vfs.writeFile('/dev/urandom', '-'.repeat(128));

    Object.assign(window, {vfs, iout});

    const RUN =
        //['hello']  // ['jump']  
        //['subproc']  
        ['subproc-pipe']
        //['threads']// ['files']
        //['exceptions']
        //['stdin'] ['spawn']
        //['io-fstream']
        //['dl-simple']
        //['/Users/corwin/var/ext/lean4/bin/lean', 'a.lean', '-o', 'a.olean']

    const prog = {
        wasmFn: `${RUN[0]}.wasm`,
        runOpts: {
            program: path.basename(RUN[0]),
            args: RUN.slice(1),
            mount: {'/': vfs},
            cwd: '/home',
            env: {'PATH': '/usr/bin', 'HOME': '/home'}
        }
    };

    let bin = fs.readFileSync(prog.wasmFn) as Uint8Array<ArrayBuffer>,
        exe = await WebAssembly.compile(bin);

    Object.assign(window, {bin, exe});

    async function runBare() {
        let rt = new Runtime;
        let instance = await rt.exec_bare(bin, prog.runOpts);
        let p = new ChildProcess(instance);
        Object.assign(window, {p, instance});

        for await (let chunk of p.read()) {
            term.write(chunk);
        }
    }

    /*  // probably not needed anymore (runWasix works well, more or less)
    async function runExec() {
        let instance = await rt.exec_wasm(bin, prog.runOpts);

        let p = new InstanceInterface(instance);

        Object.assign(window, {instance, p});
        
        let [out, err] = await Promise.all(
            [instance.stdout, instance.stderr].map(s => term.getText(s))
        );

        for (let o of [out, err]) {
            console.log(o)
        }

    }*/

    async function runTask() {
        // unfortunately this does not allow setting the program name
        let exe = Wasmer.fromWasm(bin);
        
        const instance = await exe.entrypoint.run(prog.runOpts);
        let p = new ChildProcess(instance);

        Object.assign(window, {instance, p});

        for await (let chunk of p.read()) {
            term.write(chunk);
        }
    }

    async function runWasix() {
        let instance = await wasmer.runWasix(bin, prog.runOpts);
        let p = new ChildProcess(instance);

        Object.assign(window, {instance, p});

        for await (let chunk of p.read()) {
            term.write(chunk);
        }
    }

    async function runWasixKinit() {
        let kinit = new InitProcess({module: wasmBindgenUrl, sdkUrl, workerUrl}, iout.memory);
        let instance = await kinit.spawn(bin, prog.runOpts);
        let p = new ChildProcess(instance);
    
        Object.assign(window, {kinit, instance, p});
    
        for await (let chunk of p.read()) {
            term.write(chunk);
        }    
    }

    runWasix();
}

export default main;





