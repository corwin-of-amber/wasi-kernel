
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import builtins from "rollup-plugin-node-builtins";
import node_globals from "rollup-plugin-node-globals";
import typescript from "rollup-plugin-typescript2";

import { iife, cjs, globals, targets } from "./src/infra/rollup-boilerplate";


let plugins = [
  resolve({
    preferBuiltins: true
  }),
  commonjs(),
  builtins(),
  node_globals(),
  typescript()
];

Object.assign(globals, {'@wasmer/wasi': 'WASI', '@wasmer/wasmfs': 'WasmFs'});

export default targets([
  {
    input: "src/kernel/index.ts",
    output: [iife("kernel.iife.js", "kernel")],
    plugins: plugins
  },
  {
    input: "src/kernel/index.ts",
    output: [cjs("kernel.cjs.js")],
    plugins: plugins,
    external: Object.keys(globals)
  },
  {
    key: 'worker.iife',
    input: "src/kernel/worker.ts",
    output: [iife("worker.iife.js", "worker")],
    plugins: plugins
  }
]);