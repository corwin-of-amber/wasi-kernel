import assert from 'assert';
import path from 'path';
import { EventEmitter } from 'events';

import * as constants from '@wasmer/wasi/lib/constants';

import stubs from './stubs';
import { ExecCore } from '../exec';
import { Buffer } from 'buffer';
import { SharedQueue } from './queue';
import { DynamicLoader } from './dyld';
import { fs } from './fs';
import { utf8decode } from '../bindings/utf8';



class Proc extends EventEmitter {

    core: ExecCore
    opts: ProcOptions

    sigvec: SignalVector
    childq: ChildProcessQueue
    dyld: DynamicLoader

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

        this.childq = new SharedQueue({data: new Uint32Array(new MaybeSharedArrayBuffer(4 * 128))});
        this.childset = new Set;

        this.dyld = new DynamicLoader(core);

        this.pending = [];
    }

    init() {
        const newfd = this.newfd() + 1,  /* the +1 is a hack that I do not fully understand */
              fdcwd: any = {  /* type File is not exported by wasmer :( */
                  real: newfd,
                  rights: RIGHTS_ALL,  // uhm
                  filetype: constants.WASI_FILETYPE_DIRECTORY,
                  path: '.',
                  fakePath: '.'
              };
        this.core.wasi.FD_MAP.set(AT_FDCWD, fdcwd);
        this.core.wasi.FD_MAP.set(newfd, fdcwd);  // last key inserted must be the largest

        this.core.wasmFs.fs.writeFileSync('/dev/null', '');
    }

    get import() {
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
            ...bindAll(this, [
                'geteuid', 'strmode',
                '__control_setjmp', '__control_setjmp_with_return',
                'setjmp', 'longjmp', 'sigsetjmp', 'siglongjmp',
                'vfork', '__control_fork', 'wait', 'wait3', 'execve',
                'sigkill', 'sigsuspend', 'sigaction',
                'getpagesize', 'posix_spawn']),
            ...this.dyld.import
        };
    }

    get extlib() {
        return {
            ...bindAll(this, ['trace', 'sorry', 'dupfd',
                'progname_get', 'login_get']),
            ...this.dyld.extlib
        };
    }

    get path() {
        return {...path,
            resolve: (dir: string, ...paths: string[]) => {
                if (dir == '.') dir = this.core.env.PWD; /* for AT_FDCWD */
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

    getenv_all() {
        var wasik_environ = this.core.wasm.instance.exports.wasik_environ;
        return (typeof wasik_environ === 'function')
            ? this.parse_env(wasik_environ()) : {};
    }

    parse_env(environ: i32): {[name: string]: string} {
        var d = {};
        for (let envvar of this.userGetCStrings(environ)) {
            this._parse_envvar(envvar, d);
        }
        return d;
    }

    _parse_envvar(buf: Uint8Array, d: object) {
        try {
            var text = new TextDecoder().decode(buf),
                mo = text.match(/^(.*?)=(.*)$/);
            if (mo) d[mo[1]] = mo[2];
            else console.warn(`invalid envvar? '${text}'`);
        }
        catch (e) { console.warn('parse_env', e); }
    }

    progname_get(pbuf: i32) {
        var ret = this.core.argv[0] + '\0';
        return this.userCStringMalloc(ret, pbuf);
    }

    login_get(pbuf: i32) {
        var ret = 'user' + '\0';
        return this.userCStringMalloc(ret, pbuf);
    }

    geteuid() {
        return 0;
    }

    trace(message: i32) {
        var buf = this.userGetCString(message);
        this.core.trace.user(buf);
    }

    // ----------
    // Files Part
    // ----------

    realpath(file_name: i32, resolved_name: i32) {
        var arg = this.userGetCString(file_name);
        /* @todo allocate resolved_name if null */
        if (resolved_name === 0) throw 'realpath(0): not implemented';
        let ret = path.resolve(this.core.env.PWD, utf8decode(arg)) + '\0';
        if (ret.length > PATH_MAX) throw {errno: 1, code: 'ERANGE'};
        this.membuf.write(ret, resolved_name);
        return resolved_name;
    }

    newfd(minfd: number = 0) {
        var highest = Math.max(...this.core.wasi.FD_MAP.keys());
        return Math.max(minfd, highest + 1);
    }

    dupfd(fd: i32, minfd: i32, cloexec: boolean) {
        this.core.trace.syscalls(`dupfd(${fd}, ${minfd}, ${cloexec}`);
        var desc = this.core.wasi.FD_MAP.get(fd);
        if (!desc) return -1;

        var newfd = this.newfd(minfd);
        this.core.wasi.FD_MAP.set(newfd, this.dupdesc(desc));
        return newfd;
    }

    dupdesc(desc: {real: number}): any /* File is not exported from @wasmer/wasi */ {
        // A hack to get a new "real" fd
        var newreal = this.core.wasmFs.volume.openSync('/', 'r');
        // - this heavily relies on the memfs implementation of Volume
        var realFD_MAP = this.core.wasmFs.volume.fds;
        realFD_MAP[newreal] = realFD_MAP[desc.real];
        return Object.assign({}, desc, {real: newreal});
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
        this.mem.setUint32(env, 0);  // set jmpbuf[0].ret = 0
        let impl = this.blockImpl(block), val = 0;
        try {
            while (true) {
                try {
                    return impl(val);
                }
                catch (e) {
                    this.debug(`setjmp caught ${JSON.stringify(e)}`);
                    if (e instanceof Longjmp && e.env == env)
                        val = e.val;
                    else
                        throw e;
                }
            }
        }
        finally {
            this.debug(`__control_setjmp exiting`);
        }
    }

    __control_setjmp_with_return(env: i32, block: i32) {
        return this.__control_setjmp(env, block);
    }

    setjmp(env: i32) {
        console.warn('setjmp', env);
        return 0;
    }

    longjmp(env: i32, val: i32) {
        this.debug(`longjmp [${env}] ${val}`);
        throw new Longjmp(env, val);
    }

    sigsetjmp(env: i32, save_mask: i32) {
        this.core.trace.syscalls(`sigsetjmp(${env}, ${save_mask})`);
        return 0;
    }

    siglongjmp(env: i32, val: i32) {
        this.longjmp(env, val);
    }

    vfork() {
        this.core.trace.syscalls('vfork()');
        var pid = Math.max(0, ...this.childset) + 1;
        this.childset.add(pid);
        this.onJoin = (onset: ExecvCall | Error) => {
            if (onset instanceof ExecvCall) {
                let e = onset;
                this.emit('syscall', {
                    func: 'spawn', 
                    data: {pid, execv: e.copy(), env: this.getenv_all()}
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
        this.core.trace.syscalls(`execv(${path}, ${argv}, ${envp})`);
        throw new ExecvCall(
            utf8decode(this.userGetCString(path)),
            this.userGetCStrings(argv),
            this.userGetCStrings(envp));
    }

    posix_spawn(pid: i32, path: i32, file_actions: i32, attrp: i32,
                argv: i32, envp: i32) {
        var pathStr = utf8decode(this.userGetCString(path));
        this.core.trace.syscalls(`posix_spawn(${pid}, "${pathStr}", ${file_actions}, ${attrp}, ...})`);
        var execv = new ExecvCall(
                        pathStr,
                        this.userGetCStrings(argv),
                        this.userGetCStrings(envp)),
            newPid = Math.max(0, ...this.childset) + 1;

        this.emit('syscall', {
            func: 'spawn', 
            data: {pid: newPid, execv, env: this.core.env}
        });
        this.mem.setUint32(pid, newPid, true);
        return 0;
    }

    wait(stat_loc: i32) {
        this.core.trace.syscalls(`wait(${stat_loc})`);
        return this.waitBase(stat_loc);
    }

    wait3(stat_loc: i32, options: i32, rusage: i32) {
        this.core.trace.syscalls(`wait3(${stat_loc}, ${options}, ${rusage})`);
        return this.waitBase(stat_loc);
    }
    
    waitBase(stat_loc: i32) {
        var pid = this.childq.dequeue(),
            exitcode = this.childq.dequeue();
        this.debug(`  -> ${pid}`);
        if (stat_loc !== 0)
            this.mem.setUint32(stat_loc, exitcode << 8, true);
        return pid;
    }

    // - some helpers

    userGetCString(addr: i32): Buffer {
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

    userCStringMalloc(s: string, pbuf: i32) {
        this.pending.push(() => {
            let buf = this.mem.getUint32(pbuf, true);
            this.membuf.write(s, buf);
        });
        return s.length;
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
        this.core.trace.syscalls(`sigaction(${signum}, ${act}, ${oact})`);
        if (act != 0) {
            var sa_handler = this.mem.getUint32(act, true);
            var h = <sighandler>this.funcTable.get(sa_handler);
            this.core.trace.syscalls(' -->', sa_handler, h);
            this.sigvec.handlers[signum] = h;
        }
        if (oact != 0) {
            this.mem.setUint32(oact, 0); /** @todo get previous sa_handler */
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
        this.wait = _from.wait || new Int32Array(new MaybeSharedArrayBuffer(4 * NSIG));
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

const PATH_MAX = 256;

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

    /**
     * (internal) This is needed in order to transfer the `ExecvCall`
     * via `postMessage`.
     */
    copy() {
        var cpa = (bs: Buffer[]) => bs.map(b => Buffer.from(b));
        return new ExecvCall(this.prog,
            cpa(this.argv), cpa(this.envp));
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

const MaybeSharedArrayBuffer = typeof SharedArrayBuffer != 'undefined'
    ? SharedArrayBuffer : ArrayBuffer;

function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}



export { Proc, ProcOptions, SignalVector, ChildProcessQueue }
