import {MessageEvent, Worker, onMessageType, postMessageType} from "./";
import workerThreads from "worker_threads";

// @ts-ignore
class WorkerAdapter implements Worker {
    thread: workerThreads.Worker;
    constructor(stringUrl: string) {
        this.thread = new workerThreads.Worker(stringUrl);
    }
    addEventListener(eventName: string, handler: (ev: MessageEvent) => void): void {
        this.thread.on(eventName, (ev) => {
            handler({data: ev});
        });
    }
    postMessage(msg: any) {
        this.thread.postMessage(msg);
    }
    static onMessage(handler: (ev: MessageEvent) => void) {
        workerThreads.parentPort.on('message', (ev) => {
            handler({data: ev});
        });
    }
    static postMessage(msg: any) {
        workerThreads.parentPort.postMessage(msg);
    }
}

// @ts-ignore
let postMessage: postMessageType = WorkerAdapter.postMessage;
let onMessage: onMessageType = WorkerAdapter.onMessage;


export { WorkerAdapter as Worker, onMessage, postMessage };