import * as kernel from 'wasi-kernel';
import { Volume, MemFSVolume, SharedVolume } from 'wasi-kernel';
import { PackageManager } from 'wasi-kernel/services';

import { Shell } from 'wasi-kernel/extra/shell';



async function runBare(wasm: string, argv: string[], hd: MemFSVolume, termInput: string[] = []) {
    var p = new kernel.BareProcess(wasm, {argv, tty: true, fs: hd});
    Object.assign(window, {p});

    p.on('start', () => {
        for (let ln of termInput) p.stdin.write(ln);
    });
    p.stdout.on('data', d => term.data(d));
}


async function runInWorker(wasm: string, argv: string[], hd?: Volume, termInput: string[] = []) {
    var opts = {workerScriptUri: new URL('worker.js', location.href)},
        p = new kernel.WorkerProcess(null, {...opts, argv});

    Object.assign(window, {p});
    
    if (hd instanceof SharedVolume) {
        p.worker.postMessage({
            volume: {storage: hd.storage}
        });
    }
    else {
        p.worker.postMessage({
            upload: {
                '/bin/ls': '#!/bin/coreutils/ls.wasm',
                '/bin/touch': '#!/bin/coreutils/touch.wasm'
            }
        })
    }

    p.on('start', async () => {
        console.log('%c[start]', 'color: red');
        await new Promise(r => setTimeout(r, 500));
        for (let ln of termInput) {
            await new Promise(r => setTimeout(r, 500));
            p.stdin.write(ln);
        }
    });
    p.stdout.on('data', d => term.data(d));

    let shell = new Shell();
    shell.volume = hd;
    shell.pool.opts = opts;
    shell.pool.handleSpawns(p);
    shell.on('data', d => term.data(d));

    Object.assign(window, {p, shell});

    p.exec(wasm);
}


class Terminal {
    td = new TextDecoder

    constructor(private el: HTMLElement) {
    }

    data(d: string | Uint8Array) {
        if (d instanceof Uint8Array) d = this.td.decode(d);
        console.log(d);
        this.el.innerText += d;
    }
}

let term: Terminal;


async function main() {
    term = new Terminal(document.getElementById('stdout'));

    //const WASM = '/apps/busy.wasm', ARGV = ['ls', '/home'];
    const WASM = '/bin/dash.wasm', ARGV = [], TERM_INPUT = [
        'busy touch /home/ax\n', 'busybox ls -l\n']; //'echo $PATH /bin/*\n', 'cd /home\n', 'ls -l\n', 'touch a\n', 'ls -l .\n', 'ls /\n', 'echo done\n'];
    //const WASM = '/bin/ocamlrun.wasm', ARGV = ['.', '/usr/local/lib/ocaml/ocaml'], TERM_INPUT = ["8 + 5 ;;\n", "8 * 5 ;;\n"]
    //const WASM = '/bin/coreutils/ls.wasm', ARGV = ['ls', '-l', '/'], TERM_INPUT = [];

    await kernel.init();

    var raw = new SharedArrayBuffer(64 * (1 << 20));

    var //hd = new MemFSVolume(),
        hd = new SharedVolume(raw),
        pm = new PackageManager(hd);

    Object.assign(window, {hd, raw});

    //await pm.installTar('/usr/local/lib/ocaml', new Resource('/bin/ocaml-base.tar'));
    hd.mkdirSync('/usr/bin', {recursive: true});
    hd.mkdirSync('/home/x', {recursive: true});
        
    await pm.installFile('/bin/ls', "#!/bin/coreutils/ls.wasm");
    await pm.installFile('/bin/touch', "#!/bin/coreutils/touch.wasm");
    await pm.installFile('/bin/busy', "#!/apps/busy.wasm");
    await pm.installFile('/bin/busybox', "#!/bin/busybox.wasm");

    //var shadow = new MemFSVolume(MemFS.with_storage(raw));
    //Object.assign(window, {shadow});

    //runBare(WASM, ARGV, hd, TERM_INPUT); 
    runInWorker(WASM, ARGV, hd, TERM_INPUT);


    //p.mountFs(volume);
    //p.stdout.on('data', print);
}

Object.assign(window, {main});
document.addEventListener('DOMContentLoaded', main);