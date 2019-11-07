import {MessageEvent, Worker, onMessageType, postMessageType} from "./";

// @ts-ignore
let Worker: Worker = self.Worker;
let postMessage: postMessageType = self.postMessage;
let onMessage: onMessageType = (handler) => addEventListener('message', handler);


export { Worker, onMessage, postMessage };