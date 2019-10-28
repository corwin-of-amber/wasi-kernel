import WASI from "@wasmer/wasi";
import stubs from './stubs';



class Proc {

    wasi: WASI;

    constructor(wasi: WASI) {
        this.wasi = wasi;
    }

    get env() {
        return {
            ...stubs,
            getcwd: this.getcwd.bind(this)
        };
    }

    getcwd(buf: number, sz: number) {
        console.log('getcwd', buf, sz);
        let memory_buffer = Buffer.from(this.wasi.memory.buffer);
        memory_buffer.write("/home\0", buf);
        return buf;
    }

}



export { Proc }
