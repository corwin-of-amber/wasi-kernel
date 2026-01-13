import fs from 'fs';
import * as wasmer from "@wasmer/sdk";
import { init, Runtime, Wasmer } from "@wasmer/sdk";

import { Proc } from '../../src/core/bits/proc';
import { PackageManager, Resource } from '../../src/services/package-mgr';

import { initHook } from '../../src/init.ts';

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

    /*
    const STUBS = [
        'system', 'clock', 'getpid', 'getppid', 'geteuid', 'getuid', 'getegid', 'getgid',
        'dlopen', 'dlclose', 'dlsym'
    ]

    global.init_hook = function (imp, m: WebAssembly.Module) {
        console.warn('hook', this, imp, WebAssembly.Module.imports(m));
        //window.imp = imp;
        imp.env = Object.fromEntries(WebAssembly.Module.imports(m)
            .flatMap(e => e.module === 'env' ? [[e.name, () => 0]] : []));
        imp.env['__control_setjmp'] = proc.__control_setjmp.bind(proc);
        imp.env['longjmp'] = proc.longjmp.bind(proc);
        //for (let s of STUBS)
        //    imp.env[s] = () => 0;

        imp.wasik_ext = {'sorry': () => 0, 'dlerror_get': () => 0};
        //Object.assign(imp, this);
        //Object.assign(imp.env, externals.env);// = {__indirect_function_table: proc.funcTable};
        return proc;
    }
    */

    const busyboxWasm = '/Users/corwin/var/ext/wasm/ports/busybox/busybox.wasm',
          ocamlWasm = '/Users/corwin/var/ext/wasm/ports/ocaml/ocaml-4.14/runtime/ocamlrun.wasm';

    Object.assign(window, {rt, proc});

    var term = new MiniTerm(document.querySelector('#term'));


    /*
    let vfs = new wasmer.Directory();
    await vfs.createDir('bin');
    await vfs.writeFile('bin/busybox', new Uint8Array(fs.readFileSync(busyboxWasm)));
    await vfs.writeFile('bin/ls', new Uint8Array(fs.readFileSync(busyboxWasm)));
    await vfs.writeFile('bin/touch', new Uint8Array([]));
    await vfs.writeFile('bin/hello', new Uint8Array(fs.readFileSync('hello.wasm')));
    await vfs.createDir('lib');
    await vfs.writeFile('lib/icoq.bc', new Uint8Array([]));
    await vfs.writeFile('lib/a.bc', new Uint8Array(fs.readFileSync('dist/bin/a.bc')));
    await vfs.writeFile('bin/ocaml', new Uint8Array(fs.readFileSync('dist/bin/ocaml')));
    await vfs.writeFile('bin/ocamlc', new Uint8Array(fs.readFileSync('dist/bin/ocamlc')));

    await vfs.createDir('local');
    await vfs.createDir('local/lib');
    await vfs.createDir('local/lib/ocaml');

    await vfs.createDir('share');
    await vfs.writeFile('share/a.ml', fs.readFileSync('a.ml', 'utf-8'));

    //await pm.installArchive('/local/lib/ocaml', new Resource('/ocaml-base.tar'));
*/

    let binfile = (fn: string) => new Uint8Array(fs.readFileSync(fn)),
        textfile = (fn: string) => fs.readFileSync(fn, 'utf-8')

    let vfs = new wasmer.Directory({
        'bin/busybox': binfile(busyboxWasm),
        'bin/ls': binfile(busyboxWasm),
        'bin/cat': binfile(busyboxWasm),
        'share/a.ml': textfile('a.ml'),
        'bin/ocamlrun': binfile(ocamlWasm),

        'lib/dllcamlstr.so': binfile('/Users/corwin/var/ext/wasm/ports/ocaml/ocaml-4.14/otherlibs/str/dllcamlstr.wasm'),
        'lib/dllunix.so': binfile('/Users/corwin/var/ext/wasm/ports/ocaml/ocaml-4.14/otherlibs/unix/dllunix.wasm'),
        'lib/dllthreads.so': binfile('/Users/corwin/var/ext/wasm/ports/ocaml/ocaml-4.14/otherlibs/systhreads/dllthreads.wasm'),
        'lib/dllnums.so': binfile('/Users/corwin/var/ext/wasm/ports/ocaml/libs/num/src/dllnums.wasm'),
        'lib/nums.cma': binfile('/Users/corwin/var/ext/wasm/ports/ocaml/libs/num/src/nums.cma'),
    })

    let vfs_ocaml = new DirectoryVolumeAdapter(new wasmer.Directory()),
        lazy = vfs_ocaml.lazyInstall('/', new Resource('/ocaml-base.tar'));

    await vfs.createDir('/local');
    await vfs.createDir('/local/lib');
    vfs.mountDir('/local/lib/ocaml', vfs_ocaml.root);


    let fs_hook = {
        dispatch: () => console.warn(' 0000 '),
        intercept: async m => {
            console.log(' 0001 ', m);
            if (m.op !== undefined) {
                await lazy.get(m.op)();
                

                if (m.out)
                    Atomics.notify(new Int32Array(m.out), 0);
            }
        }
    }

    Object.assign(window, {vfs, vfs_ocaml, fs_hook});


    const RUN =
        ['ocamlrun', '/usr/local/lib/ocaml/ocaml'];
        //['sh'];
        //['busybox', 'ls'];
        //['jump']  ['subproc']   ['threads']   ['files']

    const WASMS = {
        'busybox': busyboxWasm, 'sh': busyboxWasm,
        'ocamlrun': ocamlWasm
    };

    const prog = {
        wasmFn: WASMS[RUN[0]] ?? `${RUN[0]}.wasm`,
        runOpts: {
            program: RUN[0],
            args: RUN.slice(1),
            mount: {'/usr': vfs},
            cwd: '/usr'
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

    constructor(el: HTMLDivElement) { this.el = el; }

    write(s: string) {
        this.text += s;
        if (this.el) this.el.textContent = this.text;
    }

    async getText(s: ReadableStream) {
        const chunks = [], r = s.getReader();
        let td = new TextDecoder(), text = [];
        while (true) {
            let chunk = await r.read();
            if (chunk.done) break;
            else chunks.push(chunk.value);

            this.write(td.decode(chunk.value));
        }
        return chunks.map(x => td.decode(x));
    }

    /** this is incomplete */
    async getTexts(s: ReadableStream[]) {
        const chunks = [], r = s.map(s => s.getReader());
        let p = r.map(async (r, i) => [await r.read(), i] as [ReadableStreamReadResult<any>, number]);
        let td = new TextDecoder(), text = [];
        while (true) {
            let [chunk, idx] = await Promise.any(p);
            console.log(td.decode(chunk.value), idx);

            this.text += td.decode(chunk.value);
            if (this.el) this.el.textContent = this.text;

            p[idx] = (async (r, i) => [await r.read(), i] as [ReadableStreamReadResult<any>, number])(r[idx], idx);
        }

        return chunks;
    }

}



class DirectoryVolumeAdapter implements PackageManager.Volume {
    root: wasmer.Directory
    constructor(root: wasmer.Directory) {
        this.root = root;
    }

    mkdir(pathname: string, options: { recursive: boolean; }): Promise<void> {
        return options.recursive ? this.root.createDirs(pathname)
                                 : this.root.createDir(pathname);
    }

    writeFile(filename: string, content: string | Uint8Array): Promise<void> {
        return this.root.writeFileRO(filename, content);
    }

    lazyInstall(path: string = "/", resource: Resource) {
        let hid = 9;
    
        let hooks = new wasmer.Hooks;
        hooks.populate = hid;
        this.root.setHooks(hooks);

        return new Map([
            [hid, () =>
                new PackageManager(this).installArchive(path, resource)
            ]
        ]);
    }
}