export type MessageEvent = any;

export type Worker = {
    new(stringUrl: string | URL): WorkerType;

    addEventListener(eventName: string, handler: (ev: MessageEvent) => void): void;
    postMessage(msg: any): void;
};
export type onMessageType = (handler: (ev: MessageEvent) => void) => void;
export type postMessageType = (msg: any) => void;
