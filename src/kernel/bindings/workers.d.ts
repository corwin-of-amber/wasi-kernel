
export class Worker {
    constructor(scriptUrl: string);

    addEventListener(eventName: string, handler: (ev: MessageEvent) => void): void;
    postMessage(msg: any): void;
}

export type MessageEvent = {data: any};

export function postMessage(msg: any): void;
export function onMessage(handler: (ev: MessageEvent) => void): void;
