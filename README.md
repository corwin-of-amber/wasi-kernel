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

From the project root:
```sh
npm i 
npm run build
```

The `qa/test-ui` folder contains a small program to try out (`busy.c`), and a small UI application for running them. It is built using [Webpack](https://webpack.js.org) (also included in `devDependencies`). Use the same `npm i && npm run build` in the subdirectory, serve it over HTTP, and open `index.html` in a browser.

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
## Process-exit regression checks

The SDK owns WASI/WASIX process lifetime and exit status. The kernel adds its
`env` and `wasik` services without replacing the SDK's `proc_exit` handlers;
`wasik.request_terminate` remains an explicit kernel abort hook.

After installing the project dependencies, run the import-composition checks
through the normal TypeScript build:

```sh
npm run test:imports
```

For guest-level checks, build the SDK and kernel first, then:

```sh
npm run build
npm run test:browser:build
(cd tests/fixtures && WASI_KIT=native=false wasi-kit clang process-exit.c -o process-exit)
uv run --with playwright python tests/check-browser-process-exit.py
```

The last two steps need wasi-kit, a WASIX sysroot, and Chromium (the default
executable is `/usr/bin/google-chrome`; override with `--chrome`). Use
`--sdk-dir /path/to/wasmer-js/dist` to test a separate SDK build. The fixture
calls both WASIX exit imports with codes 0 and 7, checks captured output, then
runs another successful guest to verify recovery. The SDK is rebooted between the two API sequences. Unexpected page errors or guest timeouts fail the test.
