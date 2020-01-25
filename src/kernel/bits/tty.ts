import { EventEmitter } from 'events';
import { ExecCore } from "../exec";



class Tty extends EventEmitter {

    core: ExecCore
    fds: number[]
    stdin_fl: number
    termios: {flags: i32[], win: Uint16Array}

    debug: (...args: any) => void;

    constructor(core: ExecCore) {
        super();
        this.core = core;
        this.fds = [];
        this.stdin_fl = 0;
        this.termios = {
            flags: [0o402, 0o3, 0, 0o12],  /* see include/bits/termios.h */
            win: this.defaultWindow()
        };

        this.core.on('stream:out', ev => {
            if (this.fds.includes(ev.fd))
                this.emit('data', ev.data);
        });

        this.debug = () => {};
    }

    to(): TtyProps { return {termios: {win: this.termios.win}}; }

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
        this.debug(`fdstat_set_flags(${fd}, ${flags})\n`);
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

    defaultWindow() {
        var win = new Uint16Array(new SharedArrayBuffer(4));
        win[0] = 24;  // rows
        win[1] = 80;  // cols
        return win;
    }

    get overrideImport() {
        return bindAll(this, ['fd_fdstat_get', 'fd_fdstat_set_flags']);
    }

    get import() {
        return bindAll(this, ['tcgetattr', 'tcsetattr', 'tgetent']);
    }

    get extlib() {
        return bindAll(this, ['tty_ioctl']);
    }

    // ------------
    // Termois Part
    // ------------

    tcgetattr(fd: i32, termios_p: i32) {
        this.debug(`tcgetattr(${fd}, ${termios_p})`);
        let mem = this.core.proc.mem;
        this.termios.flags.forEach((fl, i) => {
            mem.setUint32(termios_p + 4 * i, fl, true);
        });

        mem.setUint8(termios_p + (4 * 4) + 1 + 5, 0);  // VTIME
        mem.setUint8(termios_p + (4 * 4) + 1 + 6, 1);  // VMIN

        /* speed other control characters are skipped :\ */
        return 0;
    }

    tcsetattr(fd: i32, when: i32, termios_p: i32) {
        this.debug(`tcsetattr(${fd}, ${when}, ${termios_p})`);
        let mem = this.core.proc.mem,
            flags = range(4).map(i => mem.getUint32(termios_p + 4 * i, true)),
            cc = range(32).map(i => mem.getUint8(termios_p + (4 * 4) + 1 + i));
        this.debug(`  [${flags.map(i => '0'+i.toString(8)).join(', ')}] [${cc}]`);
        this.termios.flags = flags;
        this.core.stdin.blocking = cc[6] > 0;   // VMIN
        this.core.proc.emit('syscall', {
            func: 'ioctl:tty',
            data: {fd, when, flags}
        })
        return 0;
    }

    tgetent(bp: i32, name: i32) {
        this.debug(`tgetent(_, '${this.core.proc.userGetCString(name)}')`);
        return 1;
    }

    tty_ioctl(fd: i32, request: i32, buf: i32) {
        console.warn('tty_ioctl', fd, request, buf);
        if (fd == 1) {
            var mem = this.core.proc.mem, win = this.termios.win;

            switch (request) {
            case TtyIoctls.TIOCGWINSZ:
                for (let i = 0; i < win.length; i++)
                    mem.setUint16(buf + 2 * i, win[i], true);
                break;
            case TtyIoctls.TIOCSWINSZ:
                var setting = win.map((_,i) => mem.getUint16(buf + 2 * i));
                this.core.proc.emit('syscall', {
                    func: 'ioctl:tty',
                    data: {fd, request, win: setting}
                });
                break;
            }
        }
    }

}


type i32 = number;

type TtyProps = {
    termios: { win: Uint16Array }
};

enum TtyIoctls {
    TCSETFL = 1,
    TIOCGWINSZ = 0x5413,
    TIOCSWINSZ = 0x5414
};

function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}

function range(n: number) : number[] {
    return [...Array(n).keys()];
}


export { Tty, TtyProps }
