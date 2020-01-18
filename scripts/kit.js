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
        'clang': Compile, 'ar': Archive, 'mv': Move
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
        this._exec(progs_native[prog], args);

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

}

class Compile extends Phase {

    patchArgs(args) {
        var patched = [], wasmOut, flags = {};
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            patched.push(arg);
            if (arg == '-c') {
                flags['-c'] = true;
            }
            else if (arg == '-o') {
                i++;
                wasmOut = patchOutput(args[i]);
                if (!wasmOut) { console.log(`  (wasm skipped)`); return; }
                patched.push(wasmOut.fn);
                console.log(`  (${wasmOut.fn} [${wasmOut.type}])`);
            }
        }
        // Handle corner case when default output is used (.c -> .o)
        if (!wasmOut) {
            if (flags['-c']) {
                var cInput = args.find(a => a.match(/[.]c$/));
                if (cInput)
                    patched.push('-o', cInput.replace(/[.]c$/, '.wo'));
                else return;
            }
            else return;
        }
        var wasiInc = this.locateIncludes();
        patched.push(`-I${wasiInc}`, '-include', `${wasiInc}/etc.h`);
        return patched;
    }

    locateIncludes() {
        var at = '';
        while (fs.realpathSync(at) != '/') {
            let loc = at + 'wasi';
            if (fs.existsSync(loc)) return loc;
            at = '../' + at;
        }
        throw new Error('wasi include directory not found');
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


main();
