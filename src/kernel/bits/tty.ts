import WASI from "@wasmer/wasi";
import { Stdin } from "../streams";



class Tty {

    wasi: WASI;
    stdin: Stdin;
    stdin_fl: number;

    debug: (...args: any) => void;

    constructor(wasi: WASI, stdin: Stdin) {
        this.wasi = wasi;
        this.stdin = stdin;

        this.stdin_fl = 4;

        this.debug = () => {};
    }

    makeTty(fd: number) {
        // Make isatty(fd) return `true`
        this.wasi.FD_MAP.get(fd).filetype = 2;
        this.wasi.FD_MAP.get(fd).rights.base &= ~BigInt(0x24);
    }

    // ------------------------------
    // Overrides for WASI.wasiImports
    // ------------------------------

    fd_fdstat_set_flags(fd: number, flags: number) {
        this.debug(`call set_flags ${flags}\n`);
        if (fd === 0) {
            this.stdin_fl = flags;
            this.stdin.blocking = !(flags & 0x4);
        }
        return 0;
    }

    fd_fdstat_get(fd: number, bufPtr: number) {
        var ret = this.wasi.wasiImport.fd_fdstat_get(fd, bufPtr);
        if (fd === 0) {
            // overwrite: stats FDFLAG u16
            this.wasi.view.setUint16(bufPtr + 2, this.stdin_fl, true);
        }
        return ret;
    }

    get import() {
        return {
            fd_fdstat_get: this.fd_fdstat_get.bind(this),
            fd_fdstat_set_flags: this.fd_fdstat_set_flags.bind(this)
        };
    }

}


export { Tty }
