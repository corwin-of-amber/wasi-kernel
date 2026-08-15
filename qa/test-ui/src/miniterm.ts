
class MiniTerm {
    text = ''
    el: HTMLDivElement
    td = new TextDecoder

    constructor(el: HTMLDivElement) { this.el = el; }

    write(s: string | Uint8Array) {
        if (s instanceof Uint8Array) s = this.td.decode(s);
        this.text += s;
        if (this.el) this.el.textContent = this.text;
    }
}


export { MiniTerm }