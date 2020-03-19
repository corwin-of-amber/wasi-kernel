
type IntArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;


class SharedQueue<A extends IntArray> {

    _data: A;
    _wait: Int32Array;

    constructor(props: SharedQueueProps<A>) {
        this._data = props.data;
        this._wait = props.wait || new Int32Array(new MaybeSharedArrayBuffer(4 * 2));
    }

    static from<A extends IntArray>(props: SharedQueueProps<A>) {
        return new SharedQueue<A>(props);
    }

    to(): SharedQueueProps<A> {
        return {data: this._data, wait: this._wait};
    }

    enqueue(v: number) {
        let head = Atomics.load(this._wait, 0), tail = Atomics.load(this._wait, 1);

        head ? head-- : (head = this._data.length);

        if (head != tail) {
            Atomics.store(this._data, tail++, v);
            Atomics.store(this._wait, 1, tail);
            Atomics.notify(this._wait, 1, 1);
            return 1;
        }
        else return 0;
    }

    enqueueAll(vs: IntArray) {
        let head = Atomics.load(this._wait, 0), tail = Atomics.load(this._wait, 1);

        head ? head-- : (head = this._data.length);

        var i: number;
        for (i = 0; head != tail && i < vs.length; i++) {
            Atomics.store(this._data, tail++, vs[i]);
        }

        if (i > 0) {
            Atomics.store(this._wait, 1, tail);
            Atomics.notify(this._wait, 1, 1);
        }
        return i;
    }

    wait() {
        let head = Atomics.load(this._wait, 0), tail = Atomics.load(this._wait, 1);

        while (head == tail) {
            Atomics.wait(this._wait, 1, tail);
            tail = Atomics.load(this._wait, 1);
        }
    }

    dequeue() {
        this.wait();

        let head = Atomics.load(this._wait, 0),
            top = Atomics.load(this._data, head++)

        Atomics.store(this._wait, 0, head);
        Atomics.notify(this._wait, 0, 1);
        return top;
    }

    dequeueSome(count: number, out: A, offset: number): number {
        if (count == 0) return 0;

        this.wait();

        let head = Atomics.load(this._wait, 0), tail = Atomics.load(this._wait, 1);

        var i: number;
        for (i = 0; head != tail && offset < count; i++) {
            out[offset++] = Atomics.load(this._data, head++);
            if (tail >= this._data.length) tail = 0;
        }

        Atomics.store(this._wait, 0, head);
        Atomics.notify(this._wait, 0, 1);
        return i;        
    }

    isEmpty() { 
        let head = Atomics.load(this._wait, 0), tail = Atomics.load(this._wait, 1);
        return head == tail;
    }
}

type SharedQueueProps<A> = { data: A, wait?: Int32Array };

const MaybeSharedArrayBuffer = typeof SharedArrayBuffer != 'undefined'
    ? SharedArrayBuffer : ArrayBuffer;



export { SharedQueue, SharedQueueProps }