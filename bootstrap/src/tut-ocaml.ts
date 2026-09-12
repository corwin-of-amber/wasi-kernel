import fs from 'fs';
import * as wasmer from "@wasmer/sdk";
import { init, Runtime } from "@wasmer/sdk";

import { PackageManager, Resource, DirectoryVolumeAdapter } from '../../src/services/package-mgr';

import { System } from '../../src/sys.ts';
import { ChildProcess } from '../../src/services/task-mgr.ts';

import { MiniTerm } from './miniterm.ts';

//let window = {};

const wasmBindgenUrl = '/node_modules/@wasmer/sdk/dist/wasmer_js_bg.wasm';
const sdkUrl = '/node_modules/@wasmer/sdk/dist/index.mjs';
//const workerUrl = '/node_modules/@wasmer/sdk/dist/worker.mjs';
const workerUrl = "/src/worker.js"

async function main() {

    await init({module: wasmBindgenUrl, log: "trace"});
    wasmer.setSDKUrl(sdkUrl);
    wasmer.setWorkerUrl(workerUrl);

    var term = new MiniTerm(document.querySelector('#term'));

    let expandUser = (fn: string) => fn.replace(/^~/, process.env['HOME']);

    let binfile = (fn: string) => new Uint8Array(fs.readFileSync(expandUser(fn))),
        textfile = (fn: string) => fs.readFileSync(expandUser(fn), 'utf-8'),
        rcsfile = (fn: string, ct?: string) => new Resource(`file://${expandUser(fn)}`, ct);

    const PORTS_ROOT = '~/var/ext/wasm/ports',
          OCAML_ROOT = `${PORTS_ROOT}/ocaml/ocaml-4.14`,
          OCAML_LIBS_ROOT = `${PORTS_ROOT}/ocaml/libs`,
          JSCOQ_WORKDIR = `~/var/workspace/jscoq`,

          busyboxWasm = `${PORTS_ROOT}/busybox/busybox.wasm`,
          ocamlWasm = `${OCAML_ROOT}/runtime/ocamlrun.wasm`;


    let vfs = new DirectoryVolumeAdapter(new wasmer.Directory({
        '/usr/bin/busybox': binfile(busyboxWasm),
        '/usr/bin/ls': binfile(busyboxWasm),
        '/usr/bin/cat': binfile(busyboxWasm),
        '/usr/share/sane.ml': textfile('progs/ocaml/sane.ml'),
        '/usr/bin/ocamlrun': binfile(ocamlWasm),

        '/home/a.ml': '',

        '/usr/lib/dllcamlstr.so': binfile(`${OCAML_ROOT}/otherlibs/str/dllcamlstr.wasm`),
        '/usr/lib/dllunix.so': binfile(`${OCAML_ROOT}/otherlibs/unix/dllunix.wasm`),
        '/usr/lib/dllthreads.so': binfile(`${OCAML_ROOT}/otherlibs/systhreads/dllthreads.wasm`),
        '/usr/lib/dllnums.so': binfile(`${OCAML_LIBS_ROOT}/num/src/dllnums.wasm`),
        '/usr/lib/nums.cma': binfile(`${OCAML_LIBS_ROOT}/num/src/nums.cma`),
        '/usr/lib/dllzarith.so': binfile(`${OCAML_LIBS_ROOT}/zarith/dllzarith.wasm`),
        '/usr/lib/dllbase_stubs.so': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/dllbase_stubs.wasm`),
        '/usr/lib/dllbase_internalhash_types_stubs.so': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/dllbase_internalhash_types_stubs.wasm`),
        '/usr/lib/base.cma': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/base.cma`),
        '/usr/lib/base_internalhash_types.cma': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/base_internalhash_types.cma`),
        '/usr/lib/shadow_stdlib.cma': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/shadow_stdlib.cma`),

        '/usr/lib/rocqworker.byte': binfile(`${JSCOQ_WORKDIR}/_build/install/jscoq+64bit/lib/rocq-runtime/rocqworker.byte`),
        '/usr/lib/dlllib_stubs.so': binfile(`${JSCOQ_WORKDIR}/_build/wasm/dlllib_stubs.wasm`),
        '/usr/lib/dllcoqrun_stubs.so': binfile(`${JSCOQ_WORKDIR}/_build/wasm/dllcoqrun_stubs.wasm`),

        '/usr/lib/findlib.conf': 'path="/usr/lib"',
        '/usr/lib/rocq-runtime/META': textfile(`${JSCOQ_WORKDIR}/_build/install/jscoq+64bit/lib/rocq-runtime/META`),
    }));

    Object.assign(window, {vfs})

    let pm = new PackageManager(vfs);

    await pm.installArchive('/usr/lib/rocq-runtime', rcsfile(`${JSCOQ_WORKDIR}/coq-pkgs/init.coq-pkg`, 'application/zip'));

    let ocamlLazy = true;
    if (ocamlLazy)
        await pm.subinstall("/usr/local/lib/ocaml", rcsfile(`${OCAML_ROOT}/base.tar`));
    else
        await pm.installArchive('/usr/local/lib/ocaml', rcsfile(`${OCAML_ROOT}/base.tar`));

    await vfs.symlink('/usr/local/lib/ocaml/ocaml', '/usr/bin/ocaml');

    Object.assign(window, {vfs});


    const RUN =
        ['ocamlrun', '/usr/local/lib/ocaml/ocaml'];
        //['ocamlrun', '/usr/lib/rocqworker.byte', '--kind=repl', '-boot', '-R', '/usr/lib/rocq-runtime', ''];
        //['sh'];
        //['busybox', 'ls'];
        //['busybox', 'less', 'a.ml']
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
            mount: vfs.mounts,
            cwd: '/home',
            env: {'OCAMLFIND_CONF': '/usr/lib/findlib.conf', 'HOME': '/home'}
        }
    };

    let bin = fs.readFileSync(prog.wasmFn) as Uint8Array<ArrayBuffer>,
        exe = await WebAssembly.compile(bin);

    //bin = fs.readFileSync('progs/ocaml/sane.exe')

    Object.assign(window, {bin, exe});

    async function runBare() {
        let rt = new Runtime();
        let instance = await rt.exec_bare(bin, prog.runOpts);
        let p = new ChildProcess(instance);
        Object.assign(window, {p, instance});

        for await (let chunk of p.read()) {
            term.write(chunk);
        }
    }

    async function runWasix() {
        let instance = await wasmer.runWasix(bin, {
            ...prog.runOpts, 
            //runtime: rt
        });
        let p = new ChildProcess(instance);

        Object.assign(window, {instance, p});

        for await (let chunk of p.read()) {
            term.write(chunk);
        }
    }

    async function runWasik() {
        let wasik = new System({sdk: sdkUrl, worker: workerUrl, wasmBindgen: wasmBindgenUrl});
        wasik.vfs = vfs;
        let p = await wasik.runWasix(bin, {...prog.runOpts, stdin: {}});

        Object.assign(window, {wasik, p});

        for await (let chunk of p.read()) {
            term.write(chunk);
        }
    }

    runWasik();
}

export default main;
