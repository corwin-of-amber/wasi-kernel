import {EventEmitter} from 'events';



class Stdin {

    queue : Uint8Array;
    wait : Int32Array;

    constructor(_from: StdinProps = {}) {
        this.queue = _from.queue || new Uint8Array(new SharedArrayBuffer(1024));
        this.wait = _from.wait || new Int32Array(new SharedArrayBuffer(8));
    }

    static from(props) { return new Stdin(props); }

    read(readBuffer: Uint8Array, offset: number, length: number, position) {
    
        // Wait for stdin
        let head = Atomics.load(this.wait, 0), tail = Atomics.load(this.wait, 1);

        if (head == tail && length > 0) {
            Atomics.wait(this.wait, 1, tail);
            tail = Atomics.load(this.wait, 1);
        }
        
        if (length > readBuffer.length) length = readBuffer.length;

        var i: number;
        for (i = 0; head != tail && offset < length; i++) {
            readBuffer[offset++] = Atomics.load(this.queue, head++);
            if (tail >= this.queue.length) tail = 0;
        }

        Atomics.store(this.wait, 0, head);
        return i;
    }

    write(writeBuffer: Uint8Array) {
        let head = Atomics.load(this.wait, 0), tail = Atomics.load(this.wait, 1);

        head ? head-- : (head = this.queue.length);

        var i;
        for (i = 0; head != tail && i < writeBuffer.length; i++) {
            Atomics.store(this.queue, tail++, writeBuffer[i]);
        }

        if (i > 0) {
            Atomics.store(this.wait, 1, tail);
            Atomics.notify(this.wait, 1, 1);
        }
        return i;
    }

}


type StdinProps = {
    queue? : Uint8Array;
    wait? : Int32Array;
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

