import { onMessage, postMessage } from './bindings/workers/node';
import nodeBindings from "@wasmer/wasi/lib/bindings/node";
import { setup } from "./worker-common";

const core = setup(postMessage, onMessage, nodeBindings);


export { core };  // useful for debugging