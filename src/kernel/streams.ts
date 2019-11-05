import { EventEmitter } from 'events';
import { SharedQueue, SharedQueueProps } from './bits/queue';



class Stdin extends EventEmitter {

    queue: SharedQueue<Uint8Array>;
    wait: Int32Array;

    blocking: boolean;

    constructor(_from: StdinProps = {}) {
        super();
        this.queue = SharedQueue.from(_from.queue ||
            {data: new Uint8Array(new SharedArrayBuffer(1024))});
        this.blocking = true;
    }

    static from(props: StdinProps) { return new Stdin(props); }

    to(): StdinProps {
        return {queue: this.queue.to()}
    }

    read(readBuffer: Uint8Array, offset: number, length: number, position) {
        
        if (length > readBuffer.length) length = readBuffer.length;

        if (this.queue.isEmpty()) {
            if (offset > 0) return 0;
            else if (!this.blocking) throw {errno: 35, code: 'EAGAIN'};
        }

        var readc = this.queue.dequeueSome(length, readBuffer, offset);
        if (readc > 0)
            this.emit('data', readBuffer.slice(offset, readc));
        return readc;
    }

    write(writeBuffer: Uint8Array) {
        return this.queue.enqueueAll(writeBuffer);
    }

}


type StdinProps = {
    queue? : SharedQueueProps<Uint8Array>;
};


class TransformStreamDuplex extends EventEmitter {

    ts : TransformStream;
    writer : WritableStreamDefaultWriter;
    reader : ReadableStreamReader;

    constructor(ts: TransformStream) {
        super();
        this.ts = ts;
        this.writer = this.ts.writable.getWriter();
        this.reader = this.ts.readable.getReader();

        (async () => {
            while (true) {
                let {done, value} = await this.reader.read();
                if (value) this.emit('data', value);
                if (done) { this.emit('end'); break; }
            }
        })();
    }

    write(data: Uint8Array) {
        this.writer.write(data);
    }

}



export {Stdin, TransformStreamDuplex}

