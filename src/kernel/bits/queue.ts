
type IntArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;


interface Queue<E, A = E[]> {
    enqueue(v: number): 0 | 1
    enqueueSome(vs: A): number
    dequeue(): number
    dequeueSome(count: number, out: A, offset: number): number
    isEmpty(): boolean
}


/**
 * A plain queue in a ring buffer.
 */
class RingQueue<A extends IntArray> implements Queue<number, IntArray> {
    _data: A
    _head = 0; _tail = 0

    constructor(props: RingQueueProps<A>) {
        this._data = props.data;
    }

    static from<A extends IntArray>(props: RingQueueProps<A>) {
        return new RingQueue<A>(props);
    }
    
    enqueue(v: number) {
        let head = this._head, tail = this._tail;
        head ? head-- : (head = this._data.length);

        if (head != tail) {
            this._data[tail++] = v;
            this._tail = tail;
            return 1;
        }
        else return 0;
    }

    enqueueSome(vs: IntArray) {
        let head = this._head, tail = this._tail;
        head ? head-- : (head = this._data.length);

        var i: number;
        for (i = 0; head != tail && i < vs.length; i++) {
            this._data[tail++] = vs[i];
        }
        if (i > 0) this._tail = tail;
        return i;
    }

    dequeue() {
        let head = this._head, tail = this._tail;
        if (head !== tail) {
            let top = this._data[head++];
            this._head = head;
            return top;
        }
        else return undefined;
    }

    dequeueSome(count: number, out: A, offset: number): number {
        if (count == 0) return 0;

        let head = this._head, tail = this._tail;

        var i: number;
        for (i = 0; head != tail && offset < count; i++) {
            out[offset++] = this._data[head++];
            if (tail >= this._data.length) tail = 0;
        }

        if (i > 0) this._head = head;
        return i;        
    }

    isEmpty() {
        let head = this._head, tail = this._tail;
        return head == tail;
    }
}

type RingQueueProps<A> = { data: A };


/**
 * A concurrent queue on top of `SharedArrayBuffer` for use in workers.
 */
class SharedQueue<A extends IntArray> implements Queue<number, IntArray> {

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

    enqueueSome(vs: IntArray) {
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


export { Queue, SharedQueue, SharedQueueProps, RingQueue, RingQueueProps }