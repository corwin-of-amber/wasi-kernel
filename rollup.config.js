
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import builtins from "rollup-plugin-node-builtins";
import node_globals from "rollup-plugin-node-globals";
import typescript from "rollup-plugin-typescript2";
import ignore from "rollup-plugin-ignore";

import {
  iife, cjs, globals, targets, defines
} from "./src/infra/rollup-boilerplate";


let plugins = [
  resolve({ preferBuiltins: true }),
  commonjs(),
  builtins(),
  node_globals(),
  typescript()
];

Object.assign(globals, {'@wasmer/wasi': 'WASI', '@wasmer/wasmfs': 'WasmFs', '@wasmer/wasm-transformer': 'w'});

let skip_core = ignore(['./exec']);

export default targets([
  {
    input: "src/kernel/index.ts",
    output: [iife("kernel.iife.js", "kernel")],
    plugins: [defines.browser, skip_core, ...plugins],
    inlineDynamicImports: true
  },
  {
    input: "src/kernel/index.ts",
    output: [cjs("kernel.cjs.js")],
    plugins: [defines.node, skip_core, ...plugins],
    inlineDynamicImports: true,
    external: Object.keys(globals)
  },
  {
    input: "src/kernel/worker.ts",
    output: [iife("worker.iife.js", "worker")],
    plugins: [defines.browser, ...plugins]
  },
  {
    input: "src/kernel/worker.ts",
    output: [cjs("worker.cjs.js")],
    plugins: [defines.node, ...plugins],
    external: Object.keys(globals)
  }
]);