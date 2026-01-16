import fs from 'fs';
import * as wasmer from "@wasmer/sdk";
import { init, Runtime, Wasmer } from "@wasmer/sdk";

import { Proc } from '../../src/core/bits/proc';
import { PackageManager, Resource, DirectoryVolumeAdapter } from '../../src/services/package-mgr';

import { FsHookMaster } from '../../src/init.ts';
import { ChildProcess } from '../../src/services/task-mgr.ts';

import { MiniTerm } from './miniterm.ts';

//let window = {};

const wasmBindgenUrl = '/node_modules/@wasmer/sdk/dist/wasmer_js_bg.wasm';
const sdkUrl = '/node_modules/@wasmer/sdk/dist/index.mjs';
//const workerUrl = '/node_modules/@wasmer/sdk/dist/worker.mjs';
const workerUrl = "/src/worker.js"

async function main() {

    await init({module: wasmBindgenUrl, log: "error"});
    wasmer.setSDKUrl(sdkUrl);
    wasmer.setWorkerUrl(workerUrl);
    
    let rt = new Runtime();

    const busyboxWasm = '~/var/ext/wasm/ports/busybox/busybox.wasm',
          ocamlWasm = '~/var/ext/wasm/ports/ocaml/ocaml-4.14/runtime/ocamlrun.wasm';

    Object.assign(window, {rt});

    var term = new MiniTerm(document.querySelector('#term'));

    let expandUser = (fn: string) => fn.replace(/^~/, process.env['HOME']);

    let binfile = (fn: string) => new Uint8Array(fs.readFileSync(expandUser(fn))),
        textfile = (fn: string) => fs.readFileSync(expandUser(fn), 'utf-8'),
        rcsfile = (fn: string, ct?: string) => new Resource(`file://${expandUser(fn)}`, ct);

    const PORTS_ROOT = '~/var/ext/wasm/ports',
          OCAML_ROOT = `${PORTS_ROOT}/ocaml/ocaml-4.14`,
          OCAML_LIBS_ROOT = `${PORTS_ROOT}/ocaml/libs`,
          JSCOQ_WORKDIR = `~/var/workspace/jscoq`;


    let vfs = new wasmer.Directory({
        'bin/busybox': binfile(busyboxWasm),
        'bin/ls': binfile(busyboxWasm),
        'bin/cat': binfile(busyboxWasm),
        'share/a.ml': textfile('a.ml'),
        'bin/ocamlrun': binfile(ocamlWasm),

        'lib/dllcamlstr.so': binfile(`${OCAML_ROOT}/otherlibs/str/dllcamlstr.wasm`),
        'lib/dllunix.so': binfile(`${OCAML_ROOT}/otherlibs/unix/dllunix.wasm`),
        'lib/dllthreads.so': binfile(`${OCAML_ROOT}/otherlibs/systhreads/dllthreads.wasm`),
        'lib/dllnums.so': binfile(`${OCAML_LIBS_ROOT}/num/src/dllnums.wasm`),
        'lib/nums.cma': binfile(`${OCAML_LIBS_ROOT}/num/src/nums.cma`),
        'lib/dllzarith.so': binfile(`${OCAML_LIBS_ROOT}/zarith/dllzarith.wasm`),
        'lib/dllbase_stubs.so': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/dllbase_stubs.wasm`),
        'lib/dllbase_internalhash_types_stubs.so': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/dllbase_internalhash_types_stubs.wasm`),
        'lib/base.cma': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/base.cma`),
        'lib/base_internalhash_types.cma': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/base_internalhash_types.cma`),
        'lib/shadow_stdlib.cma': binfile(`${OCAML_LIBS_ROOT}/janestreet/base/lib/shadow_stdlib.cma`),

        'lib/rocqworker.byte': binfile(`${JSCOQ_WORKDIR}/_build/install/jscoq+64bit/lib/rocq-runtime/rocqworker.byte`),
        'lib/dlllib_stubs.so': binfile(`${JSCOQ_WORKDIR}/_build/jscoq+64bit/backend/wasm/dlllib_stubs.wasm`),
        'lib/dllcoqrun_stubs.so': binfile(`${JSCOQ_WORKDIR}/_build/jscoq+64bit/backend/wasm/dllcoqrun_stubs.wasm`),

        'lib/findlib.conf': 'path="/usr/lib"',
        'lib/rocq-runtime/META': textfile(`${JSCOQ_WORKDIR}/_build/install/jscoq+64bit/lib/rocq-runtime/META`),
    })

    await new PackageManager(new DirectoryVolumeAdapter(vfs))
        .installArchive('lib/rocq-runtime', rcsfile(`${JSCOQ_WORKDIR}/coq-pkgs/init.coq-pkg`, 'application/zip'));
    
    let vfs_ocaml = new DirectoryVolumeAdapter(new wasmer.Directory()),
        lazy = vfs_ocaml.lazyInstall('/', rcsfile(`${OCAML_ROOT}/base.tar`));

    await vfs.createDir('/local');
    await vfs.createDir('/local/lib');
    vfs.mountDir('/local/lib/ocaml', vfs_ocaml.root);

    let home = new wasmer.Directory();

    let fs_hook = new FsHookMaster().with(lazy);

    Object.assign(window, {vfs, vfs_ocaml, fs_hook});


    const RUN =
        //['ocamlrun', '/usr/local/lib/ocaml/ocaml'];
        ['ocamlrun', '/usr/lib/rocqworker.byte', '--kind=repl', '-boot', '-R', '/usr/lib/rocq-runtime', ''];
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
        let p = new ChildProcess(instance);
        Object.assign(window, {p, instance});

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
