/**
 * A shell that can execute subprocesses using a worker pool.
 * This is here mostly for testing purposes, but is also used as a
 * bases for more fully-fledged terminal emulation apps in other
 * packages (`basin-desktop`).
 */
import path from 'path';
import { EventEmitter } from 'events';

import { Process, Volume, SharedVolume } from '../../kernel';
import { WorkerPool, ProcessLoader, WorkerPoolItem, SpawnArgs } 
       from '../../kernel/services';



class Shell extends EventEmitter implements ProcessLoader {

    fgProcesses: Process[]
    pool: WorkerPool
    env: {[name: string]: string}
    files = new Map<string, string>()
    volume: Volume = undefined;

    constructor(rootProcess?: Process) {
        super();
        this.fgProcesses = [];
        this.pool = new WorkerPool();
        this.pool.loader = this;
        this.pool.on('worker:data', (_, x) => this.emit('data', x));
        this.env = {PATH: '/bin', HOME: '/home', TERM: 'xterm-256color'};
        this.volume = undefined;

        if (rootProcess) {
            this.fgProcesses.unshift(rootProcess);
            this.pool.handleSpawns(rootProcess);
        }
    }

    spawn(prog: string, argv: string[], env?: {[name: string]: string}) {
        if (!path.isAbsolute(prog) && env.PWD)
            prog = path.join(env.PWD, prog);

        var wasm: string,
            file = this._getFile(prog),
            interp = file && this.shebang(file);

        if (interp) {
            let iargs = interp.ln.split(/\s+/);
            if (interp.nl) iargs.push(prog);
            wasm = iargs[0];
            argv = [argv[0], ...iargs.slice(1), ...argv.slice(1)];
        }
        else
            wasm = prog;

        var p = this.pool.spawn(wasm, argv, env);
        this.fgProcesses.unshift(p.process);

        p.promise
            .then(<any>((ev: {code:number}) => console.log(`${prog} - exit ${ev.code}`)))
            .catch((e: Error) => console.error(`${prog} - error;`, e))
            .finally(() => {
                /** @oops this only allows a linear process stack */
                if (this.fgProcesses[0] === p.process) {
                    this.fgProcesses.shift();
                    this.fgProcesses[0]?.sigvec.send(17 /*SIGCHLD*/)
                }
            });

        return p;
    }

    _getFile(filename: string) {
        if (Object.hasOwn(this.files, filename)) {
            return this.files[filename];
        }
        try {
            return this.volume.readFileSync(filename);
        }
        catch { return undefined; }
    }

    populate(p: WorkerPoolItem, spawnArgs: SpawnArgs) {
        if (this.volume instanceof SharedVolume)
            p.process.mountFs(this.volume);
        /*
        if (!this.filesUploaded) {
            p.process.worker.postMessage({upload: this.files});
            this.filesUploaded = true;
        }
        */
        p.process.on('syscall', ev => {
            if (ev.func === 'ioctl:tty' && ev.data.fd === 0)
                this.emit('term-ctrl', ev.data.flags);
        });
        p.process.opts.proc = {funcTableSz: 16348}; // @todo get size from wasm somehow?
    }

    exec(p: WorkerPoolItem, spawnArgs: SpawnArgs) {
        if (spawnArgs.wasm.startsWith('/bin/ocaml')) {  // @todo this is OCaml-specific; just an experiemnt for now
            var preload = ['dllcamlstr', 'dllunix', 'dllthreads'].map(b => ({
                name: `${b}.so`, uri: `/bin/ocaml/${b}.wasm`
            }));
            
            p.process.worker.postMessage({dyld: {preload}});
        }

        this.pool.exec(p, spawnArgs);
    }

    shebang(script: string | Uint8Array) {
        var magic = "#!", idx: number, ln: string;
        if (typeof script == 'string') {
            if (script.startsWith(magic)) {
                idx = script.indexOf('\n');
                ln = (idx > -1) ? script.substring(2, idx)
                                : script.substring(2);
            }
        }
        else if (script instanceof Uint8Array) {
            if (script[0] == magic.charCodeAt(0) && script[1] == magic.charCodeAt(1)) {
                var idx = script.indexOf('\n'.charCodeAt(0));
                ln = Buffer.from((idx > -1) ? script.subarray(2, idx) 
                                            : script.subarray(2))
                      .toString('utf-8');
            }
        }
        return ln ? {ln, nl: idx > -1} : undefined;
    }

    write(data: string | Uint8Array) {
        var fgp = this.fgProcesses[0];
        if (fgp) {
            if (typeof data === 'string')
                fgp.stdin.write(data);
            else
                fgp.stdin_raw.write(data);
        }
    }

    sendEof() {
        var fgp = this.fgProcesses[0];
        if (fgp) fgp.stdin.end();
    }

    /* Some file handling utilities that should not actually be part of the shell */

    readFile(fp: string, enc?: 'utf-8') {
        return new Blob([this.volume.readFileSync(fp, enc)],
            {type: enc ? 'text/plain' : 'application/octet-stream'});
    }

    downloadFile(fp: string, enc?: 'utf-8') {
        var blob = this.readFile(fp, enc), 
            a = document.createElement('a');
        a.setAttribute('href', URL.createObjectURL(blob));
        a.setAttribute('download', path.basename(fp));
        a.click();
    }
}


export { Shell }