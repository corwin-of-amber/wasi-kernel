#!/usr/bin/env node

const child_process = require('child_process'),
      path = require('path'), fs = require('fs');

const progs_native = {
    'clang': '/usr/bin/clang',
    'ar': '/usr/bin/ar',
    'mv': '/bin/mv'
};

const progs_wasi = {
    'clang': '/opt/wasi-sdk/bin/clang',
    'ar': '/opt/wasi-sdk/bin/llvm-ar',
    'mv': '/bin/mv'
};

function main() {
    var prog = path.basename(process.argv[1]),
        args = process.argv.slice(2);

    const PHASES = {
        'clang': Compile, 'ar': Archive, 'mv': Move, 'kit.js': Hijack
    },
        phase = PHASES[prog];
    
    try {
        if (phase) {
            new phase().run(prog, args);
        }
        else console.warn(`wasi-kit: unknown phase '${prog}'`);
    }
    catch (e) {
        if (e.status) process.exit(e.status);
        else throw e;
    }
}


function patchOutput(filename) {
    if (filename.match(/[.]o$/)) {
        return {type: 'obj', fn: filename.replace(/[.]o$/, '.wo')};
    }
    else if (filename.match(/[.]a$/)) {
        return {type: 'lib-archive', fn: filename.replace(/[.]a$/, '.wa')}
    }
}

class Phase {

    run(prog, args) {
        this.runNative(prog, args);
        this.runWasm(prog, args);
    }

    runNative(prog, args) {
        this._exec(progs_native[prog], args);
    }

    runWasm(prog, args) {
        var patchedArgs = this.patchArgs(args);
        if (patchedArgs) {
            this._exec(progs_wasi[prog], patchedArgs);
        }
    }

    patchArgs(args) {
        return;
    }

    _exec(prog, args) {
        //console.log(prog, args);
        return child_process.execFileSync(prog, args, {stdio: 'inherit'});
    }

    getConfig() {
        var fn = this.closest('wasi-kit.json');
        return fn ? JSON.parse(fs.readFileSync(fn, 'utf-8')) : {};
    }

    closest(basename, required = false, description = undefined) {
        var at = '';
        while (fs.realpathSync(at) != '/') {
            let loc = at + basename;
            if (fs.existsSync(loc)) return loc;
            at = '../' + at;
        }
        throw new Error(`${description || `'${basename}'`} not found`);
    }

}

class Compile extends Phase {

    patchArgs(args) {
        var config = this.getConfig();

        var patched = [], wasmOut, flags = {};
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            patched.push(arg);
            if (arg == '-c') {
                flags['-c'] = true;
            }
            else if (arg == '-o') {
                flags['-o'] = arg;
                i++;
                wasmOut = patchOutput(args[i]);
                patched.push(wasmOut ? wasmOut.fn : '/dev/null');
            }
        }
        // Handle corner case when default output is used (.c -> .o)
        if (flags['-c'] && !flags['-o']) {
            var cInput = args.find(a => a.match(/[.]c$/));
            if (cInput) {
                wasmOut = {fn: cInput.replace(/[.]c$/, '.wo'), type: 'obj'};
                patched.push('-o', wasmOut.fn);
            }
        }

        if (wasmOut && config[wasmOut.fn] === 'skip')
            wasmOut = undefined;

        if (wasmOut) {
            console.log(`  (${wasmOut.fn} [${wasmOut.type}])`);
        }
        else {
            console.log(`  (wasm skipped)`);
            return; 
        }

        var wasiInc = this.locateIncludes();
        patched.splice(0, 0, `-I${wasiInc}`, `-I${wasiInc}-preconf`, '-include', `${wasiInc}/etc.h`);
        return patched;
    }

    locateIncludes() {
        return this.closest('wasi', true, 'wasi include directory');
    }

}

class Move extends Phase {

    patchArgs(args) {
        var patched = [];
        for (let arg of args) {
            if (!arg.startsWith('-')) {
                var out = patchOutput(arg);
                if (out) arg = out.fn;
                else return;
            }
            patched.push(arg);
        }
        return patched;
    }
}


class Archive extends Phase {

    run(prog, args) {
        console.log('---  ar  ---');
        super.run(prog, args);
    }
    
    patchArgs(args) {
        var patched = [], wasmOut, wasmIn = [];
        // first arg is the action
        patched.push(args[0]);
        // second arg is the output
        wasmOut = patchOutput(args[1]);
        if (!wasmOut) { console.log(`  (wasm skipped)`); return; }
        patched.push(wasmOut.fn);
        console.log(`  (${wasmOut.fn} [${wasmOut.type}])`);
        // rest are inputs
        for (let i = 2; i < args.length; i++) {
            var inp = patchOutput(args[i]);
            if (inp && fs.existsSync(inp.fn)) {
                console.log(`   - ${inp.fn} [${inp.type}]`);
                wasmIn.push(inp);
                patched.push(inp.fn);
            }
        }
        if (wasmIn.length == 0) {
            console.log(`   (no inputs - skipped)`);
            return
        }
        return patched;
    }

}

class Hijack extends Phase {

    run(prog, args) {
        this.mkBin('/tmp/wasi-kit-hijack', __filename);
        this._exec(this.which(args[0]), args.slice(1));
    }

    which(filename) {
        if (filename.indexOf('/') >= 0) return filename;

        for (let pe of process.env['PATH'].split(':')) {
            var full = path.join(pe, filename);
            if (this.existsExec(full)) return full;
        }
        throw new Error(`${filename}: not found`);
    }

    mkBin(basedir, script) {
        if (!fs.existsSync(basedir)) {
            fs.mkdirSync(basedir);
            for (let tool of ['clang', 'mv', 'ar']) {
                fs.symlinkSync(script, path.join(basedir, tool));
            }
        }
        process.env['PATH'] = `${basedir}:${process.env['PATH']}`;
    }

    existsExec(p) {
        try {
            let stat = fs.statSync(p);
            return stat && stat.isFile() && (stat.mode & fs.constants.S_IXUSR);
        }
        catch (e) { return false; }
    }
}


main();
