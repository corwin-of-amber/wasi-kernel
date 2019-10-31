import assert from 'assert';

import stubs from './stubs';
import { EventEmitter } from "events";
import { ExecCore } from "..";



class Proc extends EventEmitter {

    core: ExecCore;
    sigvec: SignalVector;

    debug: (...args: any) => void

    constructor(core: ExecCore) {
        super();
        this.core = core;
        this.sigvec = new SignalVector;
        this.sigvec.on('signal', ev => {
            this.debug(`-- received signal -- ${ev.signal}`);
            this.emit('signal', ev);
        });
    }

    get env() {
        stubs.debug = this.debug; // global :(
        this.sigvec.debug = this.debug;
        return {
            ...stubs,
            ...bindAll(this, ['getcwd', 'longjmp', 'vfork', 'wait3',
                              'sigkill', 'sigsuspend', 'sigaction'])
        };
    }

    // ----------------
    // Environment Part
    // ----------------

    getcwd(buf: number, sz: number) {
        this.debug('getcwd', buf, sz);
        let memory_buffer = Buffer.from(this.core.wasi.memory.buffer);
        memory_buffer.write("/home\0", buf);
        return buf;
    }

    // ------------
    // Control Part
    // ------------

    longjmp() {
        throw "longjmp";
    }

    vfork() {
        return 1;
    }

    wait3() {
        if ((<any>this).waitflag)
            return 1;
        else {
            (<any>this).waitflag = true;
            return 0;
        }
    }

    // ------------
    // Signals Part
    // ------------

    sigkill(signum: number) {
        this.sigvec.send(signum);
    }

    sigsuspend(/* ... */) {
        this.emit('suspend');
        this.sigvec.receive();
    }

    sigaction(signum: i32, act: i32, oact: i32) {
        this.debug('sigaction', signum, act, oact);
        var sa_handler = this.core.wasi.view.getUint32(act, true);
        this.debug(' -->', sa_handler);
        var h = <sighandler>this.core.funcTable.get(sa_handler);
        this.debug('    ', h);
        this.sigvec.handlers[signum] = <sighandler>this.core.funcTable.get(sa_handler);
    }

}

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

        for (let i = 1; i < NSIG; i++) {
            //this.debug(`signal ${i}: ${this._snapshot[i]} --> ${this.wait[i]}`);
            if (!signums || signums.includes(i)) {
                let h = this.handlers[i];
                if (h && this._snapshot[i] < this.wait[i]) {
                    this.debug('calling', h);
                    h(i);
                } 
                this._snapshot[i] = this.wait[i];
            }
        }
        return -1;
    }

}

type SignalVectorProps = {
    wait?: Int32Array
};

type i32 = number;
type sighandler = (signum: number) => void;

const NSIG = 20;


function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}



export { Proc, SignalVector }
