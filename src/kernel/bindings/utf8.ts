
//declare function utf8encode(text: string): Uint8Array;

var utf8encode: (text: string) => Uint8Array;

if (typeof TextEncoder !== 'undefined') {
    utf8encode = (text: string) =>
        new TextEncoder().encode(text);
}
else {
    utf8encode = (text: string) => Buffer.from(text);
}


export { utf8encode }
