import { DynamicLoader } from "./dyld";


class Proc {
    instance: WebAssembly.Instance
    dyld = new DynamicLoader(this)
    debug = Trace.NOP
    trace = {
        syscalls: Trace.NOP
    }

    _funcTable = new WebAssembly.Table({element: 'anyfunc', initial: 1 << 15, maximum: 1 << 20});

    imports(): [string, [string, any][]][] {
        let bind = (o: object, l: string[]) => l.map(method => [method, o[method].bind(o)] as [string, any]);
        return [
            ['env', bind(this, ['__control_setjmp', '__control_setjmp_with_return', 'longjmp']).concat(
                    [['__indirect_function_table', this._funcTable]])],
            ['wasik', bind(this.dyld, ['dlopen', 'dlsym', 'dlclose', 'dlerror_get']).concat(
                      bind(this, ['login_get', 'progname_get', 'sorry']))]
        ];
    }

    importsObj() {
        return Object.fromEntries(
            this.imports().map(([k, v]) => [k, Object.fromEntries(v)]));
    }

    get _mem(): WebAssembly.Memory {
        return this.instance.exports.memory as WebAssembly.Memory;
    }

    get mem(): DataView {
        return new DataView(this._mem.buffer);
    }

    get funcTable() {
        return this.instance.exports.__indirect_function_table as WebAssembly.Table ?? this._funcTable;
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

    //  ---

    progname_get(pbuf: i32) {
        return this.userPendingCStringUTF8('progname', pbuf);
    }

    login_get(pbuf: i32) {
        return this.userPendingCStringUTF8('user', pbuf);
    }    

    // -----------
    // Memory Part
    // -----------

    pending: (() => void)[] = []

    private td = new TextDecoder();
    private te = new TextEncoder();

    userGetCString(ptr: i32) {
        if (ptr === 0) return this.te.encode("(null)");
        let i8a = new Uint8Array(this._mem.buffer);
        let end = i8a.indexOf(0, ptr);
        return i8a.slice(ptr, end);
    }

    userGetCStringUTF8(ptr: i32) {
        return ptr === 0 ? '(null)' : 
                this.td.decode(this.userGetCString(ptr));
    }

    userPendingBuffer(data: Uint8Array, pbuf: i32) {
        this.pending.push(() => {
            let buf = this.mem.getUint32(pbuf, true);
            new Uint8Array(this._mem.buffer).set(data, buf);
        });
        return data.length;
    }

    userPendingCStringUTF8(s: string, pbuf: i32) {
        return this.userPendingBuffer(this.te.encode(s + '\0'), pbuf);
    }

    /**
     * Flushes pending operations on allocated memory.
     * This is a nasty hack and so deserves an apology.
     */
    sorry() {
        for (var f: () => void; f = this.pending.pop(); f());
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


export { Proc, TraceFunc, Trace }