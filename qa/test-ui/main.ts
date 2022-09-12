import * as kernel from '../../src/kernel';
import { MemFSVolume } from '../../src/kernel';
import { PackageManager, Resource, Volume } from './package-mgr';


async function main() {
    function print(d) {
      console.log(d);
      document.getElementById('stdout').innerHTML += d;
    }

    //const WASM = '/apps/busy.wasm', ARGV = ['ls', '/home'];
    const WASM = '/bin/ocamlrun.wasm', ARGV = ['.', '/usr/local/lib/ocaml/ocaml'];

    await kernel.init();

    var hd = new MemFSVolume(),
        pm = new PackageManager(hd);
    await pm.installTar('/usr/local/lib/ocaml', new Resource('/bin/ocaml-base.tar'));

    //var p = new kernel.BareProcess(WASM, {argv: ARGV, tty: true, fs: hd});

    var p = new kernel.WorkerProcess(WASM, {workerScriptUri: new URL('worker.js', location.href)});
        //volume = new kernel.SharedVolume();
    
    p.on('start', () => {
        console.log('start', p);
        //p.core.stdin.write(new TextEncoder().encode("8 + 5 ;;")));
    });

    Object.assign(window, {p});

    //p.mountFs(volume);
    p.stdout.on('data', print);
}

document.addEventListener('DOMContentLoaded', main);