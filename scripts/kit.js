#!/usr/bin/env node

const child_process = require('child_process'),
      path = require('path'), fs = require('fs');

const WASI_SDK = process.env['WASI_SDK'] || '/opt/wasi-sdk',
      WASI_KIT_FLAGS = (process.env['WASI_KIT'] || '').split(',').filter(x => x);

const progs_native = {
    'gcc':       '/usr/bin/gcc',
    'g++':       '/usr/bin/g++',
    'clang':     '/usr/bin/clang',
    'clang++':   '/usr/bin/clang++',
    'ar':        '/usr/bin/ar',
    'mv':        '/bin/mv',
    'ln':        '/bin/ln'
};

const progs_wasi = {
    'gcc':       `${WASI_SDK}/bin/clang`,
    'g++':       `${WASI_SDK}/bin/clang++`,
    'clang':     `${WASI_SDK}/bin/clang`,
    'clang++':   `${WASI_SDK}/bin/clang++`,
    'ar':        `${WASI_SDK}/bin/llvm-ar`,
    'mv':        '/bin/mv',
    'ln':        '/bin/ln'
};

function main() {
    var prog = path.basename(process.argv[1]),
        args = process.argv.slice(2);

    const PHASES = {
        'gcc': Compile, 'g++': Compile,
        'clang': Compile, 'clang++': Compile,
        'ar': Archive,
        'mv': FileOp, 'ln': FileOp, 'cp': FileOp,
        'kit.js': Hijack, 'wasi-kit': Hijack
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


function patchOutput(filename, config={}) {
    if (config[filename]) {
        var base = patchOutput(filename, {}) || {};
        return {type: config[filename].type || base.type || 'bin',
                fn: config[filename].output || base.fn,
                config: config[filename]};
    }
    else if (filename.match(/[.]o$/)) {
        return {type: 'obj', fn: filename.replace(/[.]o$/, '.wo')};
    }
    else if (filename.match(/[.]a$/)) {
        return {type: 'lib-archive', fn: filename.replace(/[.]a$/, '.wa')}
    }
}

function patchArgument(arg, config={}, wasmIn=undefined) {
    if (!arg.startsWith('-')) {
        let inp = patchOutput(arg, config);
        if (inp) {
            if (fs.existsSync(inp.fn)) {
                if (wasmIn) wasmIn.push(inp);
                return inp.fn;
            }
        }
    }
    return arg;
}


class Phase {

    run(prog, args) {
        if (this._doNative())
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

    patchArgs(args) { return; }

    getOutput() { return; }

    _doNative() {
        var config = this.getConfig(),
            out = this.getOutput(), native;

        if (out && config[out] && (native = config[out].native) !== undefined
            || config['*'] && (native = config['*'].native) !== undefined)
            return native;
        else
            return true;
    }
    
    _exec(prog, args) {
        if (WASI_KIT_FLAGS.includes('verbose')) {
            console.log('[wasi-kit]  ', prog, args.join(' '));
        }
        return child_process.execFileSync(prog, args, {stdio: 'inherit'});
    }

    getConfig() {
        var fn = this.closest('wasi-kit.json');
        return fn ? JSON.parse(fs.readFileSync(fn, 'utf-8')) : {};
    }

    closest(basename, that_has = undefined) {
        var at = '';
        while (fs.realpathSync(at) != '/') {
            let loc = at + basename;
            if (fs.existsSync(loc) && 
                (that_has ? fs.existsSync(path.join(loc, that_has)): true))
                return loc;
            at = '../' + at;
        }
    }

}

class Compile extends Phase {

    run(prog, args) {
        this.parseArgs(args);
        super.run(prog, args);
    }

    getOutput() {
        return this.flags['-o'];
    }

    parseArgs(args) {
        var flags = {};
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            if (arg == '-c' || arg == '-shared') {
                flags[arg] = true;
            }
            else if (arg == '-o') {
                i++;
                flags['-o'] = args[i];
            }
        }
        this.flags = flags;
    }

    patchArgs(args) {
        var config = this.getConfig(), flags = this.flags;

        var patched = [], wasmOut, wasmIn = [];
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            patched.push(patchArgument(arg, config, wasmIn));
            if (arg == '-o') {
                i++;
                wasmOut = patchOutput(args[i], config);
                patched.push(wasmOut ? wasmOut.fn : '/dev/null');
            }
        }
        // Handle corner case when default output is used (.c -> .o)
        if (flags['-c'] && !flags['-o']) {
            if (wasmOut = this.getDefaultOutput(args)) {
                patched.push('-o', wasmOut.fn);
            }
        }

        if (wasmOut && config[wasmOut.fn] === 'skip')
            wasmOut = undefined;
        if (wasmOut && !wasmOut.config && config["*"])
            wasmOut.config = config["*"];

        this.report(wasmOut, wasmIn, flags);

        if (wasmOut) {
            return this.postProcessArgs(wasmOut, flags, patched);
        }
    }

    getDefaultOutput(args) {
        var cInput = args.find(a => a.match(/[.]c$/));
        return cInput &&
            {fn: cInput.replace(/[.]c$/, '.wo'), type: 'obj'};
    }

    getIncludeFlags() {
        var wasiInc = this.locateIncludes(), wasiPreconf = this.locatePreconf(),
            flags = [`-I${wasiInc}`, `-I${wasiInc}/c++`,
                     '-include', `${wasiInc}/etc.h`,
                     `--sysroot=${WASI_SDK}/share/wasi-sysroot`];
        if (wasiPreconf) flags.unshift(`-I${wasiPreconf}`);
        return flags;
    }

    getLinkFlags() {
        return this.buildStartupLib();
    }

    postProcessArgs(wasmOut, flags, patched) {
        // Add WASI include directories
        patched.unshift(...this.getIncludeFlags());
        if (!flags['-c'] && !flags['-shared'])
            patched.unshift(...this.getLinkFlags());

        // Apply config settings
        if (wasmOut.config) {
            if (wasmOut.config.noargs)
                patched = patched.filter(x => !this.matches(x, wasmOut.config.noargs));
            if (wasmOut.config.args)
                patched.push(...wasmOut.config.args);
        }

        return patched;
    }

    report(wasmOut, wasmIn, flags) {
        if (wasmOut) {
            console.log(`  (${wasmOut.fn} [${wasmOut.type}])`);
        }
        else {
            console.log(`  (wasm skipped)`);
            return; 
        }

        if (wasmIn && !flags['-c']) {
            for (let inp of wasmIn)
                console.log(`   - ${inp.fn} [${inp.type}]`);
        }
    }

    locateIncludes() {
        return this.closest('wasi', 'etc.h') || '/tmp/wasi-kit-hijack/include';
    }

    locatePreconf() {
        return this.closest('wasi-preconf');
    }

    buildStartupLib() {
        var outdir = '/tmp/wasi-kit-hijack', outfiles = [];
        if (!fs.existsSync(outdir))
            fs.mkdirSync(outdir);
        for (let fn of ['lib', 'bits/startup']) {
            var c = `${this.locateIncludes()}/${fn}.c`,
                o = path.join(outdir, `${path.basename(fn)}.o`);
            this._exec(progs_wasi['clang'], ['-c', c, '-o', o,
                ...this.getIncludeFlags()]);
            outfiles.push(o);
        }
        return outfiles;
    }

    matches(x, patterns) {
        function m(x, pat) {
            if (pat.startsWith("re:"))
                return new RegExp(pat.substring(3)).exec(x);
            else
                return x == pat;
        }
        return patterns.some(pat => m(x, pat));
    }

}

/**
 * Move, copy, or symlink object files.
 */
class FileOp extends Phase {

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
            for (let tool of Object.keys(progs_native)) {
                fs.symlinkSync(script, path.join(basedir, tool));
            }
            var inc = this.locateIncludes(script);
            fs.symlinkSync(inc, path.join(basedir, 'include'));
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

    existsDir(p) {
        try {
            let stat = fs.statSync(p);
            return stat && stat.isDirectory();
        }
        catch (e) { return false; }        
    }

    locateIncludes(script) {
        var d = path.dirname(script);
        while (d !== '/') {
            var inc = path.join(d, 'include');
            if (this.existsDir(inc)) return inc;
            d = path.dirname(d);
        }
        throw new Error("wasi include directory not found");
    }
}


main();
