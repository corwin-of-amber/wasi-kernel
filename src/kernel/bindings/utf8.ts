
//declare function utf8encode(text: string): Uint8Array;

var utf8encode: (text: string) => Uint8Array;

if (typeof TextEncoder !== 'undefined') {
    utf8encode = (text: string) =>
        new TextEncoder().encode(text);
}
else {
    utf8encode = (text: string) => Buffer.from(text);
}

var utf8decode: (ui8a: Uint8Array) => string;

if (typeof TextDecoder !== 'undefined') {
    utf8decode = (ui8a: Uint8Array) =>
        new TextDecoder().decode(ui8a);
}
else {
    utf8decode = (ui8a: Uint8Array) => Buffer.from(ui8a).toString('utf-8');
}

export { utf8encode, utf8decode }
