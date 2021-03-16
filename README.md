# wasi-kernel
Simple process management, streams, and shared file system for WASM modules
running in workers, based on WASI and Wasmer-JS.

The current version is compatible with [wasi-sdk](https://github.com/WebAssembly/wasi-sdk) 12.

## Development

To startup the project, you first need to do:
```sh
npm i
```

### Running in Node

If you want to run this project in Node for development, build the module with:

```sh
npm run build:node
```

Compiled JavaScript files are placed in `lib/`.

### Running in Browser

Browser integration is possible with [Parcel](https://parceljs.org).
Parcel's integrated server can be used for development.

```sh
parcel shell.html
```

Then direct your browser to http://localhost:1234/.

When developing your own project that uses wasi-kernel, employ standard `import` statements and run Parcel on your main entry point (HTML or JavaScript).

```
import { WorkerProcess } from 'wasi-kernel';

p = new WorkerProcess('/uri/of/prog.wasm');
```