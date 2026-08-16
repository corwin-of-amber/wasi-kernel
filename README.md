# wasi-kernel
Simple process management, streams, and shared file system for WASM modules
running in workers, based on WASI and Wasmer-JS.

The current version is compatible with [wasi-sdk](https://github.com/WebAssembly/wasi-sdk) 24 through 33.

## Build

The core functionality is provided by [wasmer-js](https://github.com/corwin-of-amber/wasmer-js), which is included in the submodules `packages/wasmer` and `packages/wasmer-js`.
The first step is therefore to build these dependencies.

### Wasmer-JS

 * Install [rustup](https://rustup.rs).
 * Install wasm-pack.
```
cargo install wasm-pack
```
 * Install wasm-opt (part of Binaryen).
```
npm i -g binaryen
```
 * Build with npm.
```
cd packages/wasmer-js
npm i
npm run build
```

### Wasi Kernel (library bundle & worker)

The build uses [tsup](https://tsup.egoist.dev), a frugal bundler for TypeScript based on esbuild. It is included in the package's `devDependencies`.

```sh
npm i 
npm run build
```

The `qa/test-ui` folder contains a small program to try out (`busy.c`), and a small UI application for running them. It is built using [Webpack](https://webpack.js.org).

## Use

### Compiling with WASI-kit

WASI-kit is a companion script that assists in porting C/C++ programs to WASI by wrapping
standard command-line tools in a way that is quite similar to `emmake`.

Essentially, one runs `wasi-kit <some command>`, where the command is typically `clang`, `clang++`,
`make`, `cmake`, or any other form of build script.
The wrapper script augments the environment such that invocations of standard build tools are
hijacked and instrumented.
The instrumentation involves first running the command as-is, and *in addition*, running a patched
version of it, in which the compiler is replaced by the corresponding WASI-SDK executable and flags
are added accordingly.

WASI-kit is configurable in the following ways:
 * Environment variables
   * `WASI_SDK`
   * `WASIX_LIBC`
   * `WASI_KIT`
 * Configuration file
   * `wasi-kit.json` in the project's root directory. (WASI-kit will look for it in the directory in which it is executed and parent directories, similar to how `npm` finds `package.json`.)

The configuration file is a JSON with keys representing build target (WASM binaries to generate).

Example:
```json
{
    "prog": {
        "output": "bin/prog.wasm",
        "args": ["-Wl,--allow-undefined"],
        "noargs": ["-lto"]
    }
}
```

The `args` and `noargs` keys offer surgical intervention in the command line before it is passed to WASI-SDK.
With `args`, additional arguments can be added. With `noargs`, they can be removed.

TODO: other flags and options (`"*"`, presets)