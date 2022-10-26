import assert from 'assert';
import path from 'path';
import { promisify } from 'util';
import { MemFS } from '@wasmer/wasi/lib';

/**
 * A subset of the `fs` interface that is expected to be implemented by
 * classes that represent a filesystem that can be mounted.
 */
interface Volume {
    mkdirSync(filename: string, options?: {recursive: boolean}): void

    writeFileSync(filename: string, content: string | Uint8Array): void
    writeFile(filename: string, content: string | Uint8Array, callback: (err: Error) => void): void

    readFileSync(filename: string): Uint8Array
    readFileSync(filename: string, encoding: 'utf-8'): string
    readFile(filename: string, callback: (err: Error, ret: Uint8Array) => void): void
    readFile(filename: string, encoding: 'utf-8', callback: (err: Error, ret: string) => void): void

    readdirSync(dirpath: string): string[]
    readdir(dirpath: string, callback: (err: Error, ret: string[]) => void): void

    promises?: VolumePromises
}

interface VolumePromises {
    readdir(dirpath: string): Promise<string[]>
    readFile(filename: string): Promise<Uint8Array>
    readFile(filename: string, encoding: 'utf-8'): Promise<string>
}

/**
 * An adapter between the Volume interface and Wasmer-JS's MemFS.
 */
class MemFSVolume implements Volume {
    _: MemFS
    promises: VolumePromises

    constructor(fs: MemFS = new MemFS) {
        this._ = fs;
        this.promises = {
            readdir: promisify(this.readdir),
            // @ts-ignore
            readFile: promisify(this.readFile)
        };
    }
    mkdirSync(filename: string, options?: { recursive: boolean; }): void {
        if (options?.recursive) {
            let mk = d => {
                try { this._.readDir(d); }
                catch { this._.createDir(d); }
            }

            for (let trim of filename.matchAll(/\//g)) {
                if (trim.index > 0) mk(filename.substring(0, trim.index));
            }
            mk(filename);
        }
        else this._.createDir(filename);
    }

    writeFileSync(filename: string, content: string | Uint8Array): void {
        let vf = this._.open(filename, {write: true, create: true});
        if (typeof content === 'string')
            assert(vf.writeString(content) === new Blob([content]).size);
        else
            assert(vf.write(content) === content.length);
    }
    writeFile(filename: string, content: string | Uint8Array, callback: (err: Error) => void): void {
        try { this.writeFileSync(filename, content); }
        catch (e) { callback(e); return; }
        callback(null); 
    }

    readFileSync(filename: string): Uint8Array;
    readFileSync(filename: string, encoding: 'utf-8'): string;
    readFileSync(filename: string, encoding?: 'utf-8'): string | Uint8Array {
        let vf = this._.open(filename, {read: true});
        return encoding ? vf.readString() : vf.read();
    }

    readFile(filename: string, callback: (err: Error, ret: Uint8Array) => void): void;
    readFile(filename: string, encoding: 'utf-8', callback: (err: Error, ret: string) => void): void;
    readFile(filename: string, encoding: any, callback?: any): void {
        if (!callback) { callback = encoding; encoding = undefined; }
        try { var ret = this.readFileSync(filename, encoding); }
        catch (e) { callback(e, undefined); return; }
        callback(ret);
    }

    readdirSync(dirpath: string): string[] {
        // the full path and metadata are actually quite useful...
        // but that's the API, must uphold the contract
        return this._.readDir(dirpath).map(e => path.basename(e.path));
    }
    readdir(dirpath: string, callback: (err: Error, ret: string[]) => void): void {
        try { var ret = this.readdirSync(dirpath); }
        catch (e) { callback(e, undefined); return; }
        callback(null, ret);
    }
}


class SharedVolume extends MemFSVolume {
    storage: ArrayBuffer

    constructor(storage: ArrayBuffer) {
        super(MemFS.new_with_storage(storage));
        this.storage = storage;
    }
}


export { Volume, MemFSVolume, SharedVolume }