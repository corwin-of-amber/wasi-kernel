import { isNode, isBrowser } from '../../infra/arch';
import { Worker as WorkerThread } from 'worker_threads';


let WorkerImpl, postMessage, onMessage;

if (isBrowser) {
    WorkerImpl = self.Worker;
    postMessage = self.postMessage;
    onMessage = (handler) => addEventListener('message', handler);
}
else if (isNode) {
    const workerThreads = (0||require)('worker_threads');

    // @ts-ignore
    class WorkerAdapter implements Worker {
        thread: WorkerThread;
        constructor(stringUrl: string) {
            this.thread = new workerThreads.Worker(stringUrl);
        }
        addEventListener(eventName: string, handler: (ev: any) => void): void {
            this.thread.on(eventName, (ev) => {
                handler({data: ev});
            });
        }
        postMessage(msg: any) {
            this.thread.postMessage(msg);
        }
        static onMessage(handler: (ev: any) => void) {
            workerThreads.parentPort.on('message', (ev) => {
                handler({data: ev});
            });
        }
        static postMessage(msg: any) {
            workerThreads.parentPort.postMessage(msg);
        }
    }

    WorkerImpl = WorkerAdapter;
    onMessage = WorkerAdapter.onMessage;
    postMessage = WorkerAdapter.postMessage;
}



export { WorkerImpl as Worker, onMessage, postMessage };    
