const assert = require('node:assert/strict');
const test = require('node:test');
const { Proc } = require('../.test-build/proc.cjs');

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
