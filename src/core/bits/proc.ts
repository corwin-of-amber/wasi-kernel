
class Proc {
    instance: WebAssembly.Instance
    debug = Trace.NOP
    trace = {
        syscalls: Trace.NOP
    }

    imports() {
        return ['__control_setjmp', '__control_setjmp_with_return', 'longjmp']
            .map(method => [method, this[method].bind(this)]);
    }

    get _mem(): WebAssembly.Memory {
        return this.instance.exports.memory as WebAssembly.Memory;
    }

    get mem(): DataView {
        return new DataView(this._mem.buffer);
    }

    get funcTable() {
        return this.instance.exports.__indirect_function_table as WebAssembly.Table;
    }

    // ------------
    // Setjmp/longjmp Part
    // ------------

    setjmp(env: i32) {
        console.warn('setjmp called; expected __control_setjmp');
        return 0;
    }

    sigsetjmp(env: i32, save_mask: i32) {
        console.warn('sigsetjmp called; expected __control_setjmp');
        return 0;
    }

    __control_setjmp(env: i32, block: i32) {
        this.trace.syscalls(`__control_setjmp [${env}, ${block}]`);
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

    longjmp(env: i32, val: i32) {
        this.trace.syscalls(`longjmp [${env}] ${val}`);
        throw new Longjmp(env, val);
    }

    /**
     * Used to invoke blocks: returns a function
     * @param block a C block pointer
     */
    blockImpl(block: i32) {
        let impl = this.funcTable.get(
            this.mem.getUint32(block + 12, true));
        //console.warn(this.mem.getUint32(block + 12, true), impl);
        return (...args: any) => impl(block, ...args);
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


type i32 = number;
type TraceFunc = (...args: any[]) => void

const Trace = {
    NOP: (() => {}) as TraceFunc,
    WARN: console.warn as TraceFunc
}


export { Proc, Trace }