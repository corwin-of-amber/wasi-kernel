import assert from 'assert';
import path from 'path';
import { EventEmitter } from 'events';

import stubs from './stubs';
import { ExecCore } from '../exec';
import { Buffer } from 'buffer';
import { SharedQueue } from './queue';
import { fs } from './fs';
import * as constants from '@wasmer/wasi/src/constants';



class Proc extends EventEmitter {

    core: ExecCore
    opts: ProcOptions

    sigvec: SignalVector
    childq: ChildProcessQueue

    childset: Set<number>
    onJoin: (onset: ExecvCall | Error) => void

    pending: (() => void)[]

    funcTable?: WebAssembly.Table

    debug: (...args: any) => void

    constructor(core: ExecCore, opts: ProcOptions={}) {
        super();
        this.core = core;
        this.opts = opts;

        this.sigvec = new SignalVector;
        this.sigvec.on('signal', ev => this.emit('syscall', {
            func: 'signal',
            data: ev
        }));

        this.childq = new SharedQueue({data: new Uint32Array(new SharedArrayBuffer(4 * 128))});
        this.childset = new Set;

        this.pending = [];
    }

    init() {
        this.core.wasi.FD_MAP.set(AT_FDCWD, {
            path: '.',
            real: AT_FDCWD,
            rights: RIGHTS_ALL,  // uhm
            filetype: constants.WASI_FILETYPE_DIRECTORY
        });
    }

    get import() {
        stubs.debug = this.debug; // global :(
        this.sigvec.debug = this.debug;

        if (!this.funcTable) {
            this.funcTable = new WebAssembly.Table({
                initial: this.opts.funcTableSz || 1024, 
                element: 'anyfunc'
            });
        }

        return {
            ...stubs,
            __indirect_function_table: this.funcTable, 
            ...bindAll(this, ['chdir', 'getcwd', 'geteuid', 'strmode',
                              '__control_setjmp', 'longjmp', 'siglongjmp',
                              'vfork', '__control_fork', 'wait3', 'execve',
                              'sigkill', 'sigsuspend', 'sigaction',
                              'getpagesize'])
        };
    }

    get extlib() {
        return bindAll(this, ['progname_get', 'sorry', 'dupfd']);
    }

    get path() {
        return {...path,
            resolve: (dir: string, ...paths: string[]) => {
                if (dir == '.') dir = this.core.env.CWD;
                return path.resolve(dir || '/', ...paths)
            }
        };
    }

    get mem(): DataView {
        this.core.wasi.refreshMemory();
        return this.core.wasi.view;
    }

    get membuf(): Buffer {
        return Buffer.from(this.core.wasi.memory.buffer);        
    }

    /**
     * This is a nasty hack and so deserves an apology.
     */
    sorry() {
        for (var f: () => void; f = this.pending.pop(); f());
    }

    // ----------------
    // Environment Part
    // ----------------

    chdir(buf: i32) {
        var d = this.userGetCString(buf).toString('utf-8');
        this.core.env.CWD = d;
    }

    getcwd(buf: i32, sz: i32) {
        this.debug('getcwd', buf, sz);
        /* @todo allocate buf if null */
        if (buf === 0) throw 'getcwd(0): not implemented';
        let ret = (this.core.env.CWD || '') + '\0';
        if (ret.length > sz) throw {errno: 1, code: 'ERANGE'};
        this.membuf.write(ret, buf);
        return buf;
    }

    progname_get(pbuf: number) {
        var ret = this.core.argv[0] + '\0';
        this.pending.push(() => {
            let buf = this.mem.getUint32(pbuf, true);
            this.membuf.write(ret, buf);
        });
        return ret.length;
    }

    geteuid() {
        return 0;
    }

    // ----------
    // Files Part
    // ----------

    dupfd(fd: i32, minfd: i32, cloexec: boolean) {
        return minfd; /* oops */
    }

    strmode(mode: i32, buf: i32) {
        let ret = fs.strmode(mode) + '\0';
        this.membuf.write(ret, buf);
    }

    // ------------
    // Control Part
    // ------------

    __control_setjmp(env: i32, block: i32) {
        this.debug(`__control_setjmp [${env}, ${block}]`);
        let impl = this.blockImpl(block), val = 0;
        while (true) {
            try {
                impl(val);
                break;
            }
            catch (e) {
                this.debug(`setjmp caught ${JSON.stringify(e)}`);
                if (e instanceof Longjmp && e.env == env)
                    val = e.val;
                else
                    throw e;
            }
        }
        this.debug(`__control_setjmp exiting`);
    }

    longjmp(env: i32, val: i32) {
        this.debug(`longjmp [${env}] ${val}`);
        throw new Longjmp(env, val);
    }

    siglongjmp(env: i32, val: i32) {
        this.longjmp(env, val);
    }

    vfork() {
        var pid = Math.max(0, ...this.childset) + 1;
        this.childset.add(pid);
        this.onJoin = (onset: ExecvCall | Error) => {
            if (onset instanceof ExecvCall) {
                let e = onset;
                this.debug('execv: ', e.prog, e.argv.map(x => x.toString('utf-8')));
                this.emit('syscall', {
                    func: 'spawn', 
                    data: {pid, execv: e, env: this.core.env}
                });
            }
            else throw onset;
        };
        return pid;
    }

    __control_fork(v1: i32, v2: i32, block: i32) {
        let impl = this.blockImpl(block);
        try {
            impl(v1);
            if (this.onJoin) this.onJoin(null);
        }
        catch (e) {
            if (this.onJoin) this.onJoin(e);
        }
        this.onJoin = null;
        impl(v2);
    }

    execve(path: i32, argv: i32, envp: i32) {
        this.debug(`execv(${path}, ${argv}, ${envp})`);
        throw new ExecvCall(
            this.userGetCString(path).toString('utf-8'),
            this.userGetCStrings(argv),
            this.userGetCStrings(envp));
    }

    wait3(stat_loc: i32, options: i32, rusage: i32) {
        this.debug(`wait3(${stat_loc}, ${options}, ${rusage})`);
        var pid = this.childq.dequeue(),
            exitcode = this.childq.dequeue();
        this.debug(`  -> ${pid}`);
        if (stat_loc !== 0)
            this.mem.setUint32(stat_loc, exitcode << 8, true);
        return pid;
    }

    // - some helpers

    userGetCString(addr: i32) {
        if (addr == 0) return null;
        let mem = Buffer.from(this.core.wasi.memory.buffer);
        return mem.slice(addr, mem.indexOf(0, addr));
    }

    userGetCStrings(addr: i32) {
        if (addr == 0) return null;
        let l = [];
        while(1) {
            let s = this.mem.getUint32(addr, true);
            if (s === 0) break;
            l.push(this.userGetCString(s));
            addr += 4;
        }
        return l;
    }

    /**
     * Used to invoke blocks: returns a function
     * @param block a C block pointer
     */
    blockImpl(block: i32) {
        let impl = this.funcTable.get(
            this.mem.getUint32(block + 12, true));
        return (...args: any) => impl(block, ...args);
    }

    // ------------
    // Signals Part
    // ------------

    sigkill(signum: number) {
        this.sigvec.send(signum);
    }

    sigsuspend(/* ... */) {
        this.sigvec.receive();
    }

    sigaction(signum: i32, act: i32, oact: i32) {
        this.debug('sigaction', signum, act, oact);
        var sa_handler = this.mem.getUint32(act, true);
        var h = <sighandler>this.funcTable.get(sa_handler);
        this.debug(' -->', sa_handler, h);
        this.sigvec.handlers[signum] = h;
        if (oact != 0) {
            this.mem.setUint32(oact, 0);
        }
    }

    // -----------
    // Memory Part
    // -----------

    getpagesize() {
        return 4096;
    }

}

const AT_FDCWD = -100;

const RIGHTS_ALL = {
    base: constants.RIGHTS_ALL,
    inheriting: constants.RIGHTS_ALL
};

type ProcOptions = {
    funcTableSz? : number
};


class SignalVector extends EventEmitter {

    wait: Int32Array;
    _snapshot?: Int32Array;
    handlers: sighandler[];

    debug: (...args: any) => void

    constructor(_from: SignalVectorProps={}) {
        super();
        this.wait = _from.wait || new Int32Array(new SharedArrayBuffer(4 * NSIG));
        this.handlers = Array(NSIG);
    }

    static from(props: SignalVectorProps) { return new SignalVector(props); }

    to(): SignalVectorProps {
        return {wait: this.wait};
    }

    send(signum: number) {
        assert(0 < signum && signum < NSIG);
        Atomics.add(this.wait, 0, 1);
        Atomics.add(this.wait, signum, 1);
        Atomics.notify(this.wait, 0, 1);
    }

    receive(signums?: number[]) {
        if (!this._snapshot) this._snapshot = new Int32Array(NSIG);

        Atomics.wait(this.wait, 0, Atomics.load(this.wait, 0));

        this.sweep(signums);
        return -1;
    }

    sweep(signums?: number[]) {
        for (let i = 1; i < NSIG; i++) {
            if (!signums || signums.includes(i)) {
                let h = this.handlers[i];
                if (h && this._snapshot[i] < this.wait[i]) {
                    this.debug('calling', h);
                    h(i);
                } 
                this._snapshot[i] = this.wait[i];
            }
        }
    }

}

type SignalVectorProps = {
    wait?: Int32Array
};

type i32 = number;
type sighandler = (signum: number) => void;

const NSIG = 20;


type ChildProcessQueue = SharedQueue<Uint32Array>;


class ExecvCall {
    prog: string
    argv: Buffer[]
    envp: Buffer[]
    constructor(prog: string, argv: Buffer[], envp: Buffer[]) {
        this.prog = prog;
        this.argv = argv;
        this.envp = envp;
    }
}

class Longjmp {
    env: i32
    val: i32
    constructor(env: i32, val: i32) {
        this.env = env;
        this.val = val;
    }
}

function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}



export { Proc, SignalVector, ChildProcessQueue }
