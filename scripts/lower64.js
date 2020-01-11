const infile = process.argv[2],
      outfile = process.argv[3] || 'a32.out.wasm';

const { lowerI64Imports } = require('@wasmer/wasm-transformer');

const fs = require('fs');

var bytes = fs.readFileSync(infile);
bytes = lowerI64Imports(bytes);

fs.writeFileSync(outfile, bytes);

