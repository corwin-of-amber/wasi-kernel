var Worker, postMessage, onMessage;

if (ROLLUP_IS_NODE) {
    const worker_threads = require('worker_threads');
    class WorkerAdapter {
        constructor(script) {
            this.thread = new worker_threads.Worker(script);
        }
        addEventListener(which, handler) {
            return this.thread.on(which, (ev) => {
                handler({data: ev});
            });
        }
        postMessage(msg) {
            this.thread.postMessage(msg);
        }
        static onMessage(handler) {
            worker_threads.parentPort.on('message', (ev) => {
                handler({data: ev});
            });
        }
        static postMessage(msg) {
            worker_threads.parentPort.postMessage(msg);
        }
    }
    Worker = WorkerAdapter;
    postMessage = WorkerAdapter.postMessage;
    onMessage = WorkerAdapter.onMessage;
}
else {
    Worker = self.Worker;
    postMessage = self.postMessage;
    onMessage = (handler) => addEventListener('message', handler);
}


export { Worker, postMessage, onMessage };