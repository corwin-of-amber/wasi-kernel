#!/usr/bin/env node

const child_process = require('child_process'),
      path = require('path'), fs = require('fs');

const WASI_SDK = process.env['WASI_SDK'] || '/opt/wasi-sdk',
      WASIX_LIBC = process.env['WASIX_LIBC'] || '/opt/wasix-libc',
      WASI_KIT_FLAGS = (process.env['WASI_KIT'] || '').split(',').filter(x => x);


const progs_wasi = {
    'cc':        `${WASI_SDK}/bin/clang`,
    'c++':       `${WASI_SDK}/bin/clang++`,
    'gcc':       `${WASI_SDK}/bin/clang`,
    'g++':       `${WASI_SDK}/bin/clang++`,
    'clang':     `${WASI_SDK}/bin/clang`,
    'clang++':   `${WASI_SDK}/bin/clang++`,
    'ar':        `${WASI_SDK}/bin/llvm-ar`,
    'mv':        '/bin/mv',
    'ln':        '/bin/ln'
};

const polyfills = {
    clock: [ "-D_WASI_EMULATED_PROCESS_CLOCKS", "-lwasi-emulated-process-clocks"],
};


function main() {
    var prog = path.basename(process.argv[1]),
        args = process.argv.slice(2);

    const PHASES = {
        'cc': Compile, 'c++': Compile,
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
    let out = patchOutput0(filename, config);
    if (out?.fn) out.fn = patchDune(out.fn, config);
    if (out) out.nativefn ??= filename;
    return out;
}

function patchOutput0(filename, config={}) {
        if (config[filename]) {
        var base = patchOutput0(filename, {...config, [filename]: undefined}) || {};
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
    else if (filename.match(/[.](so|dylib)$/)) {
        return {type: 'lib-dynamic', nativefn: filename}
    }
    else if (filename.match(/[.]s$/)) {
        return {type: 'skip'};
    }
}

function patchArgument(arg, config={}, wasmIn=undefined) {
    if (!arg.startsWith('-')) {
        let inp = patchOutput(arg, config);
        if (inp) {
            if (!inp.fn || fs.existsSync(inp.fn)) {
                if (wasmIn) wasmIn.push(inp);
                return inp.fn;
            }
        }
    }
    return arg;
}

/**
 * This is a bit of an ad-hoc attempt to circumvent Dune's total control
 * over managing the `_build` directory, resulting in `.wa` and `.wasm`
 * file being proactively removed.
 */
function patchDune(filename, config={}) {
    if (config.basedir) {
        let rel = path.relative(config.basedir, filename);
        if (rel.startsWith('_build/'))
            return path.join(config.basedir, rel.replace(/^_build/, '_build/wasm'));
    }
    return filename;
}


class Phase {

    run(prog, args) {
        if (this._doNative())
            this.runNative(prog, args);
        this.runWasm(prog, args);
    }

    runNative(prog, args) {
        let h = new Hijack();
        this._exec(h.which(prog, h.unhijackedPath()), args);
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

        if (WASI_KIT_FLAGS.includes('native=false'))
            return false;
        else if (out && config[out] && (native = config[out].native) !== undefined
            || config['*'] && (native = config['*'].native) !== undefined)
            return native;
        else
            return true;
    }
    
    _exec(prog, args, envvars={}) {
        if (WASI_KIT_FLAGS.includes('verbose')) {
            this.log(`[wasi-kit]   ${prog} ${args.join(' ')}`);
        }
        return child_process.execFileSync(prog, args, {
            stdio: 'inherit',
            env: {...process.env, envvars}
        });
    }

    getConfig() {
        var fn = this.closest('wasi-kit.json');
        return fn ? {
            basedir: path.dirname(fn),
            ...this._json(fs.readFileSync(fn, 'utf-8'))
        } : {};
    }

    getConfigFor(target) {
        let config = this.getConfig();
        return config[target] ?? config['*'] ?? {};
    }

    getConfigForCurrent() {
        return this.getConfigFor(this.getOutput() ?? '*');
    }

    mergeConfig(intoConfig, fromConfig) {
        for (let [k, v] of Object.entries(fromConfig)) {
            let val = intoConfig[k];
            if (Array.isArray(val)) {
                let splat = val.findIndex(el => JSON.stringify(el) === '["..."]');
                if (splat >= 0)
                    val.splice(splat, 1, ...Array.isArray(v) ? v : [v]);
            }
            else if (val === undefined)
                intoConfig[k] = v;
        }
    }

    isWasix() {
        return WASI_KIT_FLAGS.includes['wasix'] ||
            (this.getConfigForCurrent().wasix ?? this.getConfig().wasix);
    }

    isAsyncify() {
        return this.getConfigForCurrent().asyncify ??
                this.getConfig().asyncify ?? false;
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

    log(s) {
        process.stderr.write(`${s}\n`);
    }

    _json(s) {
        // One-liner comment stripper  (https://stackoverflow.com/a/62945875)
        s = s.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
        return JSON.parse(s);
    }
}

class Compile extends Phase {

    FLAGS_BOOL = ['-c', '-r', '-E', '-P',
                  '-shared', '-bundle', '-nostdlib', '-pthread']
    FLAGS_MONADIC = ['-o', '-undefined']

    run(prog, args) {
        this.parseArgs(args);
        super.run(prog, args);
        this.postprocess(prog, args);
    }

    postprocess(prog, args) {
        let config = this.getConfig(),
            out = this.getOutput();

        if (config[out]?.output && this.isAsyncify())
            this.wasmOpt(config[out]?.output);
    }

    getOutput() {
        return this.flags['-o'];
    }

    parseArgs(args) {
        var flags = {};
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            if (this.FLAGS_BOOL.includes(arg)) {
                flags[arg] = true;
            }
            else if (this.FLAGS_MONADIC.includes(arg)) {
                i++;
                flags[arg] = args[i];
            }
        }
        if (flags['-bundle']) flags['-shared'] = true;
        this.flags = flags;
    }

    patchArgs(args) {
        var config = this.getConfig(), flags = this.flags;

        if (flags['-E'] || flags['-P']) return;  /* preprocessing flags */

        var patched = [], wasmOut, wasmIn = [];
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            patched.push(patchArgument(arg, config, wasmIn));
            if (arg == '-o') {
                i++;
                wasmOut = patchOutput(args[i], config);
                patched.push(wasmOut?.fn ?? '/dev/null');
            }
        }
        // Handle corner case when default output is used (.c -> .o)
        if (flags['-c'] && !flags['-o']) {
            if (wasmOut = this.getDefaultOutput(args)) {
                patched.push('-o', wasmOut.fn);
            }
        }

        if (!wasmOut || config[wasmOut.fn] === 'skip' || wasmIn.find(inp => inp.type === 'skip'))
            wasmOut = {type: 'skip'};

        wasmOut.config ??= config["*"];

        if (wasmOut.config?.preset) {
            this.mergeConfig(wasmOut.config, config.presets?.[wasmOut.config.preset] ?? {});
        }

        this.report(wasmOut, wasmIn, flags);

        if (wasmOut.fn) {
            this.mkdirOf(wasmOut.fn); // wasm out may not be in the same directory as the native out
            return this.postProcessArgs(wasmOut, flags, patched);
        }
    }

    getDefaultOutput(args) {
        var cInput = args.find(a => a.match(/[.]c$/));
        return cInput &&
            {fn: cInput.replace(/[.]c$/, '.wo'), type: 'obj'};
    }

    getIncludeFlags() {
        var sysroot = this.locateSysroot(this.isWasix() ? WASIX_LIBC : `${WASI_SDK}/share`),
            wasiInc = this.locateIncludes(), wasiPreconf = this.locatePreconf(),
            flags = [`--sysroot=${sysroot}`,
                     `-I${wasiInc}`, `-I${wasiInc}/c++`,
                     '-include', `${wasiInc}/etc.h`];

        if (this.isWasix())
            flags.push('-D__wasix__', '-matomics', '-pthread');

        /*
        flags = [`--sysroot=/Users/corwin/var/workspace/wasi-kernel/wasi-kernel-2/packages/wasix-libc/sysroot`,
            '-D_WASI_EMULATED_PROCESS_CLOCKS',
            '-D_WASI_EMULATED_MMAN',
            '-I/Users/corwin/var/workspace/wasi-kernel/wasi-kernel-2/include',
            //'-fblocks',
            //'-matomics',
            '-mbulk-memory',
            '-mmutable-globals',
            '-pthread',
            '-mthread-model', 'posix',
            '-ftls-model=local-exec',
            '-fno-trapping-math',
        ]; */

        if (wasiPreconf) {
            flags.unshift(`-I${wasiPreconf}`);
            let prelude = path.join(wasiPreconf, '_prelude.h')
            if (fs.existsSync(prelude))
                flags.unshift('-include', prelude);
        }
        return flags;
    }

    getLinkFlags(flags, config=undefined) {
        const wasixFlags = (!this.isWasix() || flags['-nostdlib'] || flags['-r']) ? [] : [
            '-pthread', /* required for the `tls` symbols */
            '-Wl,--import-memory',
            //'-Wl,--export-dynamic',
            '-Wl,--export-if-defined=__heap_base',
            '-Wl,--export-if-defined=__stack_pointer',
            '-Wl,--export-if-defined=__stack_low',
            '-Wl,--export-if-defined=__data_end',
            '-Wl,--export-if-defined=__wasm_init_tls',
            '-Wl,--export-if-defined=__wasm_signal',
            '-Wl,--export-if-defined=__tls_size',
            '-Wl,--export-if-defined=__tls_align',
            '-Wl,--export-if-defined=__tls_base',
            ...(flags['-shared'] ? [] : ['-Wl,--export-memory'])
        ];
        if (!config?.args?.some(x => x.includes('--max-memory')))
            wasixFlags.push("-Wl,--max-memory=4294967296");
        return [...wasixFlags,
                ...(flags['-shared'] || flags['-nostdlib']) ? []
                    : this.buildStartupLib()];
    }

    postProcessArgs(wasmOut, flags, patched) {
        // Apply config settings
        if (wasmOut.config) {
            if (wasmOut.config.noargs)
                patched = patched.filter(x => !this.matches(x, wasmOut.config.noargs));
            if (wasmOut.config.args)
                patched.push(...wasmOut.config.args);
        }

        // Add WASI directories and flags
        if (!flags['-shared'])  /* wasix-libc seems to conflict with `-shared`. this might become an issue later. */
            patched.unshift(...this.getIncludeFlags());
        if (!flags['-c'])
            patched.unshift(...this.getLinkFlags(flags, wasmOut.config));

        return patched;
    }

    mkdirOf(filename) {
        if (filename)
            fs.mkdirSync(path.dirname(filename), {recursive: true});
    }

    report(wasmOut, wasmIn, flags) {
        if (WASI_KIT_FLAGS.includes('silent')) return;

        if (wasmOut?.fn) {
            this.log(`  (${wasmOut.fn} [${wasmOut.type}])`);
        }
        else {
            if (!WASI_KIT_FLAGS.includes('q') && wasmOut?.nativefn)
                this.log(`  (${wasmOut.nativefn} [skipped])`);
            return; 
        }

        if (wasmIn && !flags['-c']) {
            for (let inp of wasmIn)
                this.log(`   - ${inp.fn} [${inp.type}]`);
        }
    }

    locateSysroot(dir) {
        const stat = d => {
            try { return fs.statSync(d); } catch { return undefined; }
        };

        for (let subdir of ['sysroot', 'wasi-sysroot']) {
            let fp = path.join(dir, subdir);
            if (stat(fp)?.isDirectory()) return fp;
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
        for (let fn of [/*'lib', 'bits/startup'*/]) {
            var c = `${this.locateIncludes()}/${fn}.c`,
                o = path.join(outdir, `${path.basename(fn)}.o`);
            this._exec(progs_wasi['clang'], ['-c', c, '-o', o,
                ...this.getIncludeFlags()]);
            outfiles.push(o);
        }
        return outfiles;
    }

    wasmOpt(wasmFn) {
        this._exec('wasm-opt', ['--asyncify', '-g', wasmFn, '-o', wasmFn])
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
                if (out?.fn) arg = out.fn;
                else return;
            }
            patched.push(arg);
        }
        return patched;
    }
}


class Archive extends Phase {
    
    patchArgs(args) {
        let config = this.getConfig();
        var patched = [], wasmOut, wasmIn = [];
        // first arg is the action
        patched.push(args[0]);
        // second arg is the output
        wasmOut = patchOutput(args[1], config);
        if (!wasmOut) { this.log(`  (wasm skipped)`); return; }
        patched.push(wasmOut.fn);
        this.log(`  (${wasmOut.fn} [${wasmOut.type}])`);
        // rest are inputs
        for (let i = 2; i < args.length; i++) {
            var inp = patchOutput(args[i], config);
            if (inp && fs.existsSync(inp.fn)) {
                this.log(`   - ${inp.fn} [${inp.type}]`);
                wasmIn.push(inp);
                patched.push(inp.fn);
            }
        }
        if (wasmIn.length == 0) {
            this.log(`   (no inputs - skipped)`);
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

    which(filename, searchPath = undefined) {
        if (filename.indexOf('/') >= 0) return filename;

        for (let pe of this.searchPath(searchPath)) {
            var full = path.join(pe, filename);
            if (this.existsExec(full)) return full;
        }
        throw new Error(`${filename}: not found`);
    }

    searchPath(sp /* string | string[]*/ = process.env['PATH']) {
        return typeof sp === 'string' ? sp.split(':') : sp;
    }

    unhijackedPath(sp = undefined) {
        return this.searchPath(sp)
            .filter(pe => !pe.includes('/wasi-kit-hijack'));
    }

    mkBin(basedir, script) {
        if (!fs.existsSync(basedir)) {
            fs.mkdirSync(basedir);
            for (let tool of Object.keys(progs_wasi)) {
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
        //throw new Error("wasi include directory not found");
    }
}


main();
