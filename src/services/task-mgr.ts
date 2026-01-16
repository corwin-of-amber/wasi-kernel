import * as wasmer from '@wasmer/sdk';

/**
 * Wraps a Wasmer instance and provides access to input/output streams.
 */
class ChildProcess {
    instance: wasmer.Instance
    stdin: Stdin

    constructor(instance: wasmer.Instance) {
        this.instance = instance;
        this.stdin = new Stdin(this.instance.stdin.getWriter());
    }

    write(buf: string | Uint8Array) {
        this.stdin.write(buf);
    }

    async *read() {
        let streams = [this.instance.stdout, this.instance.stderr],
            td = new TextDecoder();

        for await (let chunk of readCollate(streams))
            yield td.decode(chunk.value);
    }
}


class Stdin {
    writer: WritableStreamDefaultWriter<Uint8Array>
    te = new TextEncoder

    constructor(writer: WritableStreamDefaultWriter<Uint8Array>) {
        this.writer = writer;
    }

    write(buf: string | Uint8Array) {
        if (typeof buf === 'string')
            buf = this.te.encode(buf);
        return this.writer.write(buf);
    }
}


async function *readCollate(s: ReadableStream[]) {
    const r = s.map(s => s.getReader()),
          poll = async (r: ReadableStreamDefaultReader<any>, i: number) =>
                 [await r.read(), i] as [ReadableStreamReadResult<any>, number];
    let p = r.map(poll);
    while (p.some(x => x)) {
        let [chunk, idx] = await Promise.any(Object.values(p));

        if (chunk.done) {
            delete p[idx];
        }
        else {
            yield chunk;
            p[idx] = poll(r[idx], idx);
        }
    }
}


export { ChildProcess }