import fs from 'fs';
import * as wasmer from "@wasmer/sdk";
import { init, Runtime, Wasmer } from "@wasmer/sdk";

import { MiniTerm } from './miniterm.ts';

import { ChildProcess } from '../../src/services/task-mgr.ts';

//let window = {};

const wasmBindgenUrl = '/node_modules/@wasmer/sdk/dist/wasmer_js_bg.wasm';
const sdkUrl = '/node_modules/@wasmer/sdk/dist/index.mjs';
//const workerUrl = '/node_modules/@wasmer/sdk/dist/worker.mjs';
const workerUrl = "/src/worker.js"

async function main() {

    await init({module: wasmBindgenUrl, log: "trace"});
    wasmer.setSDKUrl(sdkUrl);
    wasmer.setWorkerUrl(workerUrl);

    let rt = new Runtime();
    Object.assign(window, {rt});

    var term = new MiniTerm(document.querySelector('#term'));

    let vfs = {usr: new wasmer.Directory(), home: new wasmer.Directory};

    Object.assign(window, {vfs});

    const RUN =
        ['hello'];
        //['jump']  ['subproc']   ['threads']   ['files']

    const prog = {
        wasmFn: `${RUN[0]}.wasm`,
        runOpts: {
            program: RUN[0],
            args: RUN.slice(1),
            mount: {'/usr': vfs.usr, '/home': vfs.home},
            cwd: '/usr',
            env: {'PATH': '/usr/bin', 'HOME': '/home'}
        }
    };

    let bin = (fs.readFileSync(prog.wasmFn)),
        exe = await WebAssembly.compile(bin);

    Object.assign(window, {bin, exe});

    async function runBare() {
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
        let exe = Wasmer.fromWasm(bin, rt);
        
        const instance = await exe.entrypoint.run(prog.runOpts);
        let p = new ChildProcess(instance);

        Object.assign(window, {instance, p});

        for await (let chunk of p.read()) {
            term.write(chunk);
        }
    }

    async function runWasix() {
        let instance = await wasmer.runWasix(bin, {
            ...prog.runOpts, 
            runtime: rt
        });
        let p = new ChildProcess(instance);

        Object.assign(window, {instance, p});

        for await (let chunk of p.read()) {
            term.write(chunk);
        }
    }

    runWasix();
}

export default main;





