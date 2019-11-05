import { ExecCore } from "../exec";
import { Stdin } from "../streams";



class Tty {

    core: ExecCore;
    stdin: Stdin;
    stdin_fl: number;

    debug: (...args: any) => void;

    constructor(core: ExecCore, stdin: Stdin) {
        this.core = core;
        this.stdin = stdin;

        this.stdin_fl = 4;

        this.debug = () => {};
    }

    makeTty(fd: number) {
        // Make isatty(fd) return `true`
        this.core.wasi.FD_MAP.get(fd).filetype = 2;
        this.core.wasi.FD_MAP.get(fd).rights.base &= ~BigInt(0x24);
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
        var ret = this.core.wasi.wasiImport.fd_fdstat_get(fd, bufPtr);
        if (fd === 0) {
            // overwrite: stats FDFLAG u16
            this.core.wasi.view.setUint16(bufPtr + 2, this.stdin_fl, true);
        }
        return ret;
    }

    get overrideImport() {
        return bindAll(this, ['fd_fdstat_get', 'fd_fdstat_set_flags']);
    }

    get import() {
        return bindAll(this, ['tcgetattr', 'tcsetattr']);
    }

    // ------------
    // Termois Part
    // ------------

    tcgetattr(fd: i32, termios_p: i32) {
        this.debug(`tcgetattr(${fd}, ${termios_p})`);
        return 0;
    }

    tcsetattr(fd: i32, actions: i32, termios_p: i32) {
        this.debug(`tcsetattr(${fd}, ${actions}, ${termios_p})`);
        return 0;
    }

}


type i32 = number;

function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}


export { Tty }
