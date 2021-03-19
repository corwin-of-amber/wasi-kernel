# wasi-kernel
Simple process management, streams, and shared file system for WASM modules
running in workers, based on WASI and Wasmer-JS.

The current version is compatible with [wasi-sdk](https://github.com/WebAssembly/wasi-sdk) 12.

## Build

To startup the project, you first need to do:
```sh
npm i
```

The build uses [Parcel](https://parceljs.org). It is not listed as a project dependency due to its size. Install it globally instead via:
```sh
npm i -g parcel
```

(The project was developed with Parcel 1.12.4, and may not be compatible with 2.x, if this version ever materializes.)

To build Node.js modules and the Web worker:
```sh
npm run build
```

You can quickly test your build by running `parcel shell.html`, then directing your browser to http://localhost:1234/.

## Use

When developing your own project that uses wasi-kernel, employ standard `import` statements and run Parcel on your main entry point (HTML or JavaScript).
When targeting the browser, bundlers are directed to the source entry point
(`src/kernel/index.ts`), which exposes the public APIs.

```js
import { WorkerProcess } from 'wasi-kernel';

p = new WorkerProcess('/uri/of/prog.wasm');
```