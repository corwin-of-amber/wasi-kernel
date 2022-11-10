export { MemFS } from '@wasmer/wasi/lib';
export { ProcessBase as Process, WorkerProcess, BareProcess } from './process';
export { ExecCore } from './exec';
export type { ExecCoreOptions } from './exec';

export { Volume, MemFSVolume, SharedVolume } from './services/fs';

import { init as wasi_init } from '@wasmer/wasi/lib';

import WASI_BG_URI from '@wasmer/wasi/pkg/wasmer_wasi_js_bg.wasm';

var _init: Promise<void> = undefined;
export async function init(wasmerWasmUri: string = <any>WASI_BG_URI) {
    await (_init ??= wasi_init(_fetch(wasmerWasmUri)));
}

async function _fetch(uri: string) {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
}
