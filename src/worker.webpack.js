console.log(`%c➤ Worker is starting %c[${globalThis.name}]`, 'color: blue', 'color: gray')

import './worker.ts';

Error.stackTraceLimit = 50;
globalThis.onerror = console.error;
globalThis.lastWasmError = undefined;

let pendingMessages = [];
let worker = {
  // Buffering up all messages until worker is initialized.
  handleMessage(msg) { pendingMessages.push(msg); }
};

globalThis.onmessage = async ev => {
  if (ev.data.type == "init") {
    const { module, id, sdkUrl, workerUrl, memory } = ev.data;
    //await import('./worker.js');
    worker = new WasikThreadPoolWorker(await import(/* webpackIgnore: true*/ sdkUrl));
    await worker.init(id, { module, sdkUrl, workerUrl, memory });
    // handle any buffered messages
    worker.consume(pendingMessages);
  }
  else {
    await worker.handleMessage(ev.data);
  }

  if (lastWasmError) {
    wworker.handleError(lastWasmError);
    lastWasmError = undefined;
  }
};
