import fs from 'fs';
import * as wasmer from "@wasmer/sdk";
import { init, Runtime, Wasmer } from "@wasmer/sdk";

import { Proc } from '../../src/core/bits/proc';
import { PackageManager, Resource, DirectoryVolumeAdapter } from '../../src/services/package-mgr';

import { FsHookMaster, initHook } from '../../src/init.ts';

//let window = {};

const wasmBindgenUrl = '/node_modules/@wasmer/sdk/dist/wasmer_js_bg.wasm';
const sdkUrl = '/node_modules/@wasmer/sdk/dist/index.mjs';
//const workerUrl = '/node_modules/@wasmer/sdk/dist/worker.mjs';
const workerUrl = "/src/worker.js"

async function main() {

    await init({module: wasmBindgenUrl, log: "trace"});
    wasmer.setSDKUrl(sdkUrl);
    wasmer.setWorkerUrl(workerUrl);
    
    let proc = new Proc;
    proc.debug = console.warn

    let rt = new Runtime();

    const busyboxWasm = '~/var/ext/wasm/ports/busybox/busybox.wasm',
          ocamlWasm = '~/var/ext/wasm/ports/ocaml/ocaml-4.14/runtime/ocamlrun.wasm';

    Object.assign(window, {rt, proc});

    var term = new MiniTerm(document.querySelector('#term'));

    let expandUser = (fn: string) => fn.replace(/^~/, process.env['HOME']);

    let binfile = (fn: string) => new Uint8Array(fs.readFileSync(expandUser(fn))),
        textfile = (fn: string) => fs.readFileSync(expandUser(fn), 'utf-8'),
        rcsfile = (fn: string, ct?: string) => new Resource(`file://${expandUser(fn)}`, ct);

    let vfs = new wasmer.Directory({
        'bin/busybox': binfile(busyboxWasm),
        'bin/ls': binfile(busyboxWasm),
        'bin/cat': binfile(busyboxWasm),
        'share/a.ml': textfile('a.ml'),
        'bin/ocamlrun': binfile(ocamlWasm),

        'lib/dllcamlstr.so': binfile('~/var/ext/wasm/ports/ocaml/ocaml-4.14/otherlibs/str/dllcamlstr.wasm'),
        'lib/dllunix.so': binfile('~/var/ext/wasm/ports/ocaml/ocaml-4.14/otherlibs/unix/dllunix.wasm'),
        'lib/dllthreads.so': binfile('~/var/ext/wasm/ports/ocaml/ocaml-4.14/otherlibs/systhreads/dllthreads.wasm'),
        'lib/dllnums.so': binfile('~/var/ext/wasm/ports/ocaml/libs/num/src/dllnums.wasm'),
        'lib/nums.cma': binfile('~/var/ext/wasm/ports/ocaml/libs/num/src/nums.cma'),
        'lib/dllzarith.so': binfile('~/var/ext/wasm/ports/ocaml/libs/zarith/dllzarith.wasm'),
        //'lib/nums.cma': binfile('~/var/ext/wasm/ports/ocaml/libs/num/src/nums.cma'),
        'lib/dllbase_stubs.so': binfile('~/var/ext/wasm/ports/ocaml/libs/janestreet/base/lib/dllbase_stubs.wasm'),
        'lib/dllbase_internalhash_types_stubs.so': binfile('~/var/ext/wasm/ports/ocaml/libs/janestreet/base/lib/dllbase_internalhash_types_stubs.wasm'),
        'lib/base.cma': binfile('~/var/ext/wasm/ports/ocaml/libs/janestreet/base/lib/base.cma'),
        'lib/base_internalhash_types.cma': binfile('~/var/ext/wasm/ports/ocaml/libs/janestreet/base/lib/base_internalhash_types.cma'),
        'lib/shadow_stdlib.cma': binfile('~/var/ext/wasm/ports/ocaml/libs/janestreet/base/lib/shadow_stdlib.cma'),

        'lib/rocq.bc': binfile('~/var/workspace/jscoq/_build/jscoq+64bit/_vendor+v9.0+64bit/coq/topbin/rocqworker.bc'),
        'lib/dlllib_stubs.so': binfile('~/var/workspace/jscoq/_build/jscoq+64bit/backend/wasm/dlllib_stubs.wasm'),
        'lib/dllcoqrun_stubs.so': binfile('~/var/workspace/jscoq/_build/jscoq+64bit/backend/wasm/dllcoqrun_stubs.wasm'),

        'lib/findlib.conf': 'path="/usr/lib"',
        'lib/rocq-runtime/META': textfile('~/var/workspace/jscoq/_build/install/jscoq+64bit/lib/rocq-runtime/META'),
    })

    await new PackageManager(new DirectoryVolumeAdapter(vfs))
        .installArchive('lib/rocq-runtime', rcsfile('~/var/workspace/jscoq/coq-pkgs/init.coq-pkg', 'application/zip'));
    
    let vfs_ocaml = new DirectoryVolumeAdapter(new wasmer.Directory()),
        lazy = vfs_ocaml.lazyInstall('/', rcsfile('~/var/ext/wasm/ports/ocaml/ocaml-4.14/base.tar'));

    await vfs.createDir('/local');
    await vfs.createDir('/local/lib');
    vfs.mountDir('/local/lib/ocaml', vfs_ocaml.root);

    let home = new wasmer.Directory();

    let fs_hook = new FsHookMaster().with(lazy);

    Object.assign(window, {vfs, vfs_ocaml, fs_hook});


    const RUN =
        ['ocamlrun', '/usr/local/lib/ocaml/ocaml'];
        //['ocamlrun', '/usr/lib/rocq.bc', '--kind=repl', '-boot', '-R', '/usr/lib/rocq-runtime', ''];
        //['sh'];
        //['busybox', 'ls'];
        //['jump']  ['subproc']   ['threads']   ['files']

    const WASMS = {
        'busybox': busyboxWasm, 'sh': busyboxWasm,
        'ocamlrun': ocamlWasm
    };

    const prog = {
        wasmFn: expandUser(WASMS[RUN[0]] ?? `${RUN[0]}.wasm`),
        runOpts: {
            program: RUN[0],
            args: RUN.slice(1),
            mount: {'/usr': vfs, '/home': home},
            cwd: '/usr',
            env: {'OCAMLFIND_CONF': '/usr/lib/findlib.conf', 'HOME': '/home'}
        }
    };

    let bin = (fs.readFileSync(prog.wasmFn)),
        exe = await WebAssembly.compile(bin);

    Object.assign(window, {bin, exe});

    async function runBare() {
        let instance = await rt.exec_bare(bin, prog.runOpts);
        Object.assign(window, {instance});

        let [out, err] = await Promise.all(
            [instance.stdout, instance.stderr].map(s => term.getText(s))
        );

        for (let o of [out, err]) {
            console.log(o)
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
        let p = new InstanceInterface(instance);

        Object.assign(window, {instance, p});

        let [out, err] = await Promise.all(
            [instance.stdout, instance.stderr].map(s => term.getText(s))
        );

        const output = await instance.wait();
        console.log(`The output:\n\n${output.stdout}\n${output.stderr}`);

        term.write(output.stdout);
        term.write(output.stderr);
    }

    async function runWasix() {
        let instance = await wasmer.runWasix(bin, {
            ...prog.runOpts, 
            runtime: rt
        });
        let p = new InstanceInterface(instance);

        Object.assign(window, {instance, p});

        let [out, err] = await Promise.all(
            [instance.stdout, instance.stderr].map(s => term.getText(s))
        );

        Object.assign(window, {out: {out, err}});

        /*const output = await instance.wait();
        console.log(`The output:\n\n${output.stdout}\n${output.stderr}`);

        term.write(output.stdout);
        term.write(output.stderr);*/
    }

    runWasix();
}

export default main;




class InstanceInterface {
    instance: wasmer.Instance
    writer: WritableStreamDefaultWriter<Uint8Array>

    constructor(instance: wasmer.Instance) {
        this.instance = instance;
        this.writer = this.instance.stdin.getWriter();
    }

    write(buf: string | Uint8Array) {
        if (typeof buf === 'string')
            buf = new TextEncoder().encode(buf);
        return this.writer.write(buf);
    }
}


class MiniTerm {
    text = ''
    el: HTMLDivElement
    td = new TextDecoder

    constructor(el: HTMLDivElement) { this.el = el; }

    write(s: string | Uint8Array) {
        if (s instanceof Uint8Array) s = this.td.decode(s);
        this.text += s;
        if (this.el) this.el.textContent = this.text;
    }

    async getText(s: ReadableStream) {
        const chunks = [], r = s.getReader();
        while (true) {
            let chunk = await r.read();
            if (chunk.done) break;
            else chunks.push(chunk.value);

            this.write(chunk.value);
        }
        return chunks;
    }

    /** this is incomplete */
    async getTexts(s: ReadableStream[]) {
        const r = s.map(s => s.getReader());
        let p = r.map(async (r, i) => [await r.read(), i] as [ReadableStreamReadResult<any>, number]);
        let td = new TextDecoder(), text = [];
        while (true) {
            let [chunk, idx] = await Promise.any(p);
            console.log(td.decode(chunk.value), idx);

            this.write(td.decode(chunk.value));

            p[idx] = (async (r, i) => [await r.read(), i] as [ReadableStreamReadResult<any>, number])(r[idx], idx);
        }
    }

}

