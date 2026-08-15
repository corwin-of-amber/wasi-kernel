import * as wasmer from '@wasmer/sdk';

/**
 * Wraps a Wasmer instance and provides access to input/output streams.
 */
class ChildProcess {
    instance: wasmer.Instance
    runtime?: wasmer.Runtime
    stdin: Stdin

    constructor(instance: wasmer.Instance, runtime?: wasmer.Runtime) {
        this.instance = instance;
        this.runtime = runtime;
        if (this.instance.stdin)
            this.stdin = new Stdin(this.instance.stdin.getWriter());
    }

    write(buf: string | Uint8Array) {
        this.stdin.write(buf);
    }

    async *read() {
        let td = new TextDecoder();

        for await (let chunk of this.readRaw())
            yield td.decode(chunk.value);
    }

    readRaw() {
        return readCollate([this.instance.stdout, this.instance.stderr]);
    }

    async pipeInto(out: {write: (buf: Uint8Array) => void}) {
        for await (let chunk of this.readRaw())
            out.write(chunk.value);
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
        try {
            let [chunk, idx] = await Promise.any(Object.values(p));

            if (chunk.done) {
                delete p[idx];
            }
            else {
                yield chunk;
                p[idx] = poll(r[idx], idx);
            }
        } catch (e) { console.warn('[readCollate]', e); }
    }
}


export { ChildProcess }