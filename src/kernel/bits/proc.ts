import assert from 'assert';
import path from 'path';

import stubs from './stubs';
import { EventEmitter } from "events";
import { ExecCore } from "../exec";
import { Buffer } from 'buffer';
import { SharedQueue } from './queue';



class Proc extends EventEmitter {

    core: ExecCore;
    opts: ProcOptions;

    sigvec: SignalVector;
    childq: ChildProcessQueue;

    childset: Set<number>;

    funcTable?: WebAssembly.Table;

    debug: (...args: any) => void

    constructor(core: ExecCore, opts: ProcOptions={}) {
        super();
        this.core = core;
        this.opts = opts;

        this.sigvec = new SignalVector;
        this.sigvec.on('signal', ev => this.emit('signal', ev));

        this.childq = new SharedQueue({data: new Uint32Array(new SharedArrayBuffer(4 * 128))});
        this.childset = new Set;
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
            ...bindAll(this, ['getcwd', 'longjmp', 'vfork', 'wait3',
                              'sigkill', 'sigsuspend', 'sigaction'])
        };
    }

    get path() {
        return {...path,
            resolve: (dir: string, ...fns: string[]) =>
                path.resolve(dir || '/', ...fns)
        };
    }

    // ----------------
    // Environment Part
    // ----------------

    getcwd(buf: number, sz: number) {
        this.debug('getcwd', buf, sz);
        /* @todo allocate buf if null */
        let ret = `${this.core.env.CWD || ''}\0`;
        if (ret.length > sz) throw {errno: 1, code: 'ERANGE'};
        let memory_buffer = Buffer.from(this.core.wasi.memory.buffer);
        memory_buffer.write(ret, buf);
        return buf;
    }

    // ------------
    // Control Part
    // ------------

    longjmp() {
        throw "longjmp";
    }

    vfork() {
        var pid = Math.max(0, ...this.childset) + 1;
        this.childset.add(pid);
        this.emit('spawn', {pid});
        return pid;
    }

    wait3(stat_loc: i32, options: i32, rusage: i32) {
        this.debug(`wait3(${stat_loc}, ${options}, ${rusage})`);
        var pid = this.childq.dequeue();
        this.debug(`  -> ${pid}`);
        return pid;
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
        var sa_handler = this.core.wasi.view.getUint32(act, true);
        var h = <sighandler>this.funcTable.get(sa_handler);
        this.debug(' -->', sa_handler, h);
        this.sigvec.handlers[signum] = h;
    }

}

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


function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}



export { Proc, SignalVector, ChildProcessQueue }
