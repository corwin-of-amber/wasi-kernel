// Rollup Config for the Wasm File System Example

import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import builtins from "rollup-plugin-node-builtins";
import globals from "rollup-plugin-node-globals";
import typescript from "rollup-plugin-typescript2";


const sourcemapOption = process.env.PROD ? undefined : "inline";

let plugins = [
  resolve({
    preferBuiltins: true
  }),
  commonjs(),
  builtins(),
  globals(),
  typescript()
];

const wasmerGlobals = {'@wasmer/wasi': 'WASI', '@wasmer/wasmfs': 'WasmFs'};

const out = (x, type) => ({ file: `dist/${x}`, format: type, sourcemap: sourcemapOption }),
      iife = (fn, name) => Object.assign(out(fn, 'iife'), {name}),
      cjs =  fn => Object.assign(out(fn, 'cjs'), {globals: wasmerGlobals});


export default [
  {
    input: "src/kernel/index.ts",
    output: [iife("kernel.iife.js", "kernel")],
    plugins: plugins
  },
  {
    input: "src/kernel/index.ts",
    output: [cjs("kernel.cjs.js")],
    plugins: plugins,
    external: Object.keys(wasmerGlobals)
  },
  {
    input: "src/kernel/worker.ts",
    output: [iife("worker.iife.js", "worker")],
    plugins: plugins
  }
];

