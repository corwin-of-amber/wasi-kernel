import WASI from "@wasmer/wasi";
import stubs from './stubs';



class Proc {

    wasi: WASI;
    sigvec: SignalVector;

    debug: (...args: any) => void

    constructor(wasi: WASI) {
        this.wasi = wasi;
        this.sigvec = new SignalVector;
    }

    get env() {
        stubs.debug = this.debug; // global :(
        return {
            ...stubs,
            ...bindAll(this, ['getcwd', 'longjmp']),
            ...bindAll(this.sigvec, ['sigsuspend'])
        };
    }

    getcwd(buf: number, sz: number) {
        this.debug('getcwd', buf, sz);
        let memory_buffer = Buffer.from(this.wasi.memory.buffer);
        memory_buffer.write("/home\0", buf);
        return buf;
    }

    longjmp() {
        throw "longjmp";
    }

}

class SignalVector {

    wait: Int32Array;

    constructor(_from: SignalVectorProps={}) {
        this.wait = new Int32Array(new SharedArrayBuffer(8));
    }

    sigkill() {
        Atomics.add(this.wait, 0, 1);
        Atomics.notify(this.wait, 0, 1);
    }

    sigsuspend() {
        Atomics.wait(this.wait, 0, 0);
    }

}

type SignalVectorProps = {
    wait?: Int32Array
};


function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}



export { Proc, SignalVector }
