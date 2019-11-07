import { onMessage, postMessage } from './bindings/workers/browser';
import browserBindings from "@wasmer/wasi/lib/bindings/browser";
import { setup } from "./worker-common";

const core = setup(postMessage, onMessage, browserBindings);


export { core };  // useful for debugging