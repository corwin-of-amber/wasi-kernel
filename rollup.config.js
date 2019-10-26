// Rollup Config for the Wasm File System Example

import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import builtins from "rollup-plugin-node-builtins";
import globals from "rollup-plugin-node-globals";


const sourcemapOption = process.env.PROD ? undefined : "inline";

let plugins = [
  resolve({
    preferBuiltins: true
  }),
  commonjs(),
  builtins(),
  globals()
];


const iife = x => ({ file: `dist/${x}`, format: 'iife', sourcemap: sourcemapOption });


export default [
  {
    input: "src/kernel/index.js",
    output: [iife("kernel.iife.js")],
    plugins: plugins
  },
  {
    input: "src/kernel/worker.js",
    output: [iife("worker.iife.js")],
    plugins: plugins
  }
];

