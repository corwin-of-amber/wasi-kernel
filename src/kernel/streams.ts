import { EventEmitter } from 'events';
import { SharedQueue, SharedQueueProps } from './bits/queue';



class SimplexStream extends EventEmitter {

    queue: SharedQueue<Uint8Array>
    meta: Int32Array

    pos: number
    blocking: boolean

    constructor(_from: SimplexStreamProps = {}) {
        super();
        this.queue = SharedQueue.from(_from.queue ||
            {data: new Uint8Array(new SharedArrayBuffer(1024))});
        this.meta = _from.meta || new Int32Array(new SharedArrayBuffer(4));
        if (!_from.meta) this.length = -1;
        /* local state */
        this.pos = 0;
        this.blocking = true;
    }

    static from(props: SimplexStreamProps) { return new SimplexStream(props); }

    to(): SimplexStreamProps { return {queue: this.queue.to(), meta: this.meta}; }

    get length() {
        return Atomics.load(this.meta, 0);
    }

    set length(l: number) {
        Atomics.store(this.meta, 0, l);
    }

    read(readBuffer: Uint8Array, offset: number, length: number, position) {
        
        if (length > readBuffer.length) length = readBuffer.length;

        if (this.queue.isEmpty()) {
            if (offset > 0) return 0;
            else if (!this.blocking) throw {errno: 35, code: 'EAGAIN'};
        }

        var readc = this.queue.dequeueSome(length, readBuffer, offset);
        if (readc > 0) {
            if (this.length >= 0)
                readc = Math.min(this.length - this.pos, readc);
            this.pos += readc;
            this.emit('data', readBuffer.slice(offset, readc));
        }
        return readc;
    }

    write(writeBuffer: Uint8Array) {
        let writec = this.queue.enqueueAll(writeBuffer);
        this.pos += writec;
        return writec;
    }

    end() {
        this.length = this.pos;
        this.queue.enqueue(0);  // got to enqueue something to notify
    }

    reset() {
        this.length = -1;
        this.pos = 0;
        this.blocking = true;
    }
}


type SimplexStreamProps = {
    queue? : SharedQueueProps<Uint8Array>;
    meta? : Int32Array;
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

    end() {
        this.writer.close();
    }

}



export {SimplexStream, TransformStreamDuplex}

