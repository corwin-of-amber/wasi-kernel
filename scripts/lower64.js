
const { lowerI64Imports } = require('@wasmer/wasm-transformer');

const fs = require('fs');

var bytes = fs.readFileSync('busy.wasm');
bytes = lowerI64Imports(bytes);

fs.writeFileSync('busy32.wasm', bytes);

