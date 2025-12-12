import * as wasmer from '@wasmer/sdk';

import main from './tut-hello.ts';
import './shell.css';

console.log(self);

if (typeof window !== 'undefined') {
    Object.assign(window, {
        __todo_metavar: {url: ''},  //        file:///Users/corwin/var/workspace/wasi-kernel/wasi-kernel-2/bootstrap/node_modules/@wasmer/sdk/dist/index.mjs'},
        wasmer
    });
    main();
}
else {
    Object.assign(self, {
        __todo_metavar: {url: 'file:///Users/corwin/var/workspace/wasi-kernel/wasi-kernel-2/bootstrap/node_modules/@wasmer/sdk/dist/index.mjs'},
    });
    //main();
}

