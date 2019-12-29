import { EventEmitter } from 'events';
import { ExecCore } from "../exec";



class Tty extends EventEmitter {

    core: ExecCore
    fds: number[]
    stdin_fl: number
    termios: {flags: i32[]}

    debug: (...args: any) => void;

    constructor(core: ExecCore) {
        super();
        this.core = core;
        this.fds = [];
        this.stdin_fl = 0;
        this.termios = {
            flags: [0o402, 0o3, 0, 0o12]  /* see include/bits/termios.h */
        };

        this.core.on('stream:out', ev => {
            if (this.fds.includes(ev.fd))
                this.emit('data', ev.data);
        });

        this.debug = () => {};
    }

    makeTty(fd: number) {
        // Make isatty(fd) return `true`
        this.core.wasi.FD_MAP.get(fd).filetype = 2;
        this.core.wasi.FD_MAP.get(fd).rights.base &= ~BigInt(0x24);
    }

    write(data: any) {
        this.core.stdin.write(data);
    }

    // ------------------------------
    // Overrides for WASI.wasiImports
    // ------------------------------

    fd_fdstat_set_flags(fd: number, flags: number) {
        this.debug(`call set_flags ${flags}\n`);
        if (fd === 0) {
            this.stdin_fl = flags;
            this.core.stdin.blocking = !(flags & 0x4);
        }
        return 0;
    }

    fd_fdstat_get(fd: number, bufPtr: number) {
        var ret = this.core.wasi.wasiImport.fd_fdstat_get(fd, bufPtr);
        if (fd === 0) {
            // overwrite: stats FDFLAG u16
            this.core.proc.mem.setUint16(bufPtr + 2, this.stdin_fl, true);
        }
        return ret;
    }

    get overrideImport() {
        return bindAll(this, ['fd_fdstat_get', 'fd_fdstat_set_flags']);
    }

    get import() {
        return bindAll(this, ['tcgetattr', 'tcsetattr', 'tgetent']);
    }

    // ------------
    // Termois Part
    // ------------

    tcgetattr(fd: i32, termios_p: i32) {
        this.debug(`tcgetattr(${fd}, ${termios_p})`);
        let mem = this.core.proc.mem;
        for (let fl of this.termios.flags) {
            mem.setUint32(termios_p, fl, true);
            termios_p += 4;
        }
        /* speed and character table are skipped :\ */
        return 0;
    }

    tcsetattr(fd: i32, when: i32, termios_p: i32) {
        this.debug(`tcsetattr(${fd}, ${when}, ${termios_p})`);
        let mem = this.core.proc.mem,
            flags = range(4).map((_,i) => mem.getUint32(termios_p + i * 4, true));
        this.debug(`  ${JSON.stringify(flags)}`);
        this.core.proc.emit('syscall', {
            func: 'ioctl:tty',
            data: {fd, when, flags}
        })
        return 0;
    }

    tgetent(bp: i32, name: i32) {
        this.debug(`tgetent(_, '${this.core.proc.userGetCString(name)})`);
        return 1;
    }

}


type i32 = number;

function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}

function range(n: number) : number[] {
    return [...Array(n).keys()];
}


export { Tty }
