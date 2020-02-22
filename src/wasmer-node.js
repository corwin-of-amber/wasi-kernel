require('source-map-support').install();



const fs = require("fs");
const WASI = require("@wasmer/wasi");
const wasmTransformer = require("@wasmer/wasm-transformer");
const WasmerFileSystem = require("@wasmer/wasmfs/dist/index.cjs.js");

// Set up our file system (NOTE: We could use node's fs normally for this case)
const wasmerFs = new WasmerFileSystem.WasmFs();

//stdin reading
let stdinBuffer = [];
const stdinRead = (readBuffer, offset, length, position) => {
    
  console.log('readBuffer =', readBuffer, '  offset =', offset, 'length =', length);
  
  // Wait for stdin
  if (stdinBuffer.length == 0 && length > 0) {
      require("deasync").loopWhile(() => stdinBuffer.length == 0);
  }

  //if (length > readBuffer.length) length = readBuffer.length;
    
  var i;
  for (i = 0; i < stdinBuffer.length && offset < length; i++) {
    readBuffer[offset++] = stdinBuffer[i];
  }

  stdinBuffer.splice(0, i);
  return i;
};

// stdout / error writing
const stdoutWrite = buffer => {
  process.stdout.write(buffer);
  return buffer.length;
};


wasmerFs.volume.fds[0].read = stdinRead.bind(this);
wasmerFs.volume.fds[1].write = stdoutWrite.bind(this);
wasmerFs.volume.fds[2].write = stdoutWrite.bind(this);



const wasi = new WASI({
  bindings: {
    ...WASI.defaultBindings,
    fs: wasmerFs.fs
  }
});

// Read in the input Wasm file
const wasmBuffer = fs.readFileSync('busy-wasi.wasm');

// Transform the binary
let wasmBinary = new Uint8Array(wasmBuffer);
wasmBinary = wasmTransformer.lowerI64Imports(wasmBinary);

const Fiber = require('fibers');

const asyncTask = async () => {
  const response = await WebAssembly.instantiate(wasmBinary, {
    wasi_unstable: wasi.wasiImport
  });

  // Take in stdin
    /*
  rl.on("line", line => {
    console.log(line);
    currentStdinLine = line;
  });*/

  setTimeout(() => stdinBuffer.push(97, 101, 98, 10), 1000);
  setTimeout(() => stdinBuffer.push(99, 49, 100, 10), 2000);

  Fiber(() => {

  try {
    wasi.start(response.instance);
  } catch (e) {
    console.error("ERROR:");
    console.error(e);
  }

  }).run();
};
asyncTask();
