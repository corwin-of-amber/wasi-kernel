const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Import composition is independent of the dynamic loader and guest memory.
const source = fs.readFileSync(path.join(__dirname, '../src/core/bits/proc.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const context = { exports: {}, TextEncoder, TextDecoder, console,
    require(name) {
        assert.equal(name, './dyld');
        return { DynamicLoader: class {
            dlopen() {} dlsym() {} dlclose() {} dlerror_get() {}
        } };
    }
};
vm.runInNewContext(outputText, context);
const { Proc } = context.exports;

test('preserve SDK process-exit handlers when extending imports', () => {
    const proc_exit = () => {};
    const proc_exit2 = () => {};
    const imports = { wasix_32v1: { proc_exit, proc_exit2 } };
    assert.equal(new Proc().importsObj(imports), imports);
    assert.equal(imports.wasix_32v1.proc_exit, proc_exit);
    assert.equal(imports.wasix_32v1.proc_exit2, proc_exit2);
    assert.equal(typeof imports.wasik.dlopen, 'function');
    assert.equal(typeof imports.env.__control_setjmp, 'function');
});

test('keep explicit kernel termination separate from SDK process exit', () => {
    const imports = new Proc().importsObj();
    assert.equal(imports.wasix_32v1, undefined);
    assert.throws(() => imports.wasik.request_terminate(7), /termination requested \(rc=7\)/);
});
