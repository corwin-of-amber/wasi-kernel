import {EventEmitter} from 'events';



class Stdin {

    constructor(_from={}) {
        this.queue = _from.queue || new Uint8Array(new SharedArrayBuffer(1024));
        this.wait = _from.wait || new Int32Array(new SharedArrayBuffer(8));
    }

    static from(props) { return new Stdin(props); }

    read(readBuffer, offset, length, position) {
    
        //console.log('readBuffer =', readBuffer, '  offset =', offset, 'length =', length);

        // Wait for stdin
        let head = Atomics.load(this.wait, 0), tail = Atomics.load(this.wait, 1);

        if (head == tail && length > 0)
            tail = Atomics.wait(this.wait, 1, tail);
        
        if (length > readBuffer.length) length = readBuffer.length;

        var i;
        for (i = 0; head != tail && offset < length; i++) {
            readBuffer[offset++] = Atomics.load(this.queue, head++);
            if (tail >= this.queue.length) tail = 0;
        }

        Atomics.store(this.wait, 0, head);
        return i;
    }

    write(writeBuffer) {
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



class TransformStreamDuplex extends EventEmitter {

    constructor(ts) {
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

    write(data) {
        this.writer.write(data);
    }

}



export {Stdin, TransformStreamDuplex}

