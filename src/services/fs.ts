
class FsHookMaster {
    actions = new Map<number, () => Promise<void>>()
    hid = 0

    with(actions: typeof this.actions) {
        for (let [k, v] of actions.entries())
            this.actions.set(k, v);
        return this;
    }
    
    add(action: () => Promise<void>) {
        let k = ++this.hid;
        this.actions.set(k, action)
        return k;
    }

    dispatch(op: number) {
        if (this.actions.has(op))
            console.warn(' fs hook dispatch from main thread?');
    }

    async intercept(m: {op: number, out: SharedArrayBuffer}) {
        console.log('==  fs hook intercept ==', m);
        if (m.op !== undefined) {
            let op = this.actions.get(m.op);
            this.actions.delete(m.op);  // each op is single-shot
            if (op) await op();

            if (m.out)
                Atomics.notify(new Int32Array(m.out), 0);
        }
    }
}


export { FsHookMaster }