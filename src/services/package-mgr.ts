/**
 * The package manager is not part of the kernel per se,
 * but a worker without some sensible way to install packages is rather
 * useless, and so this functionality is here so that it can get compiled
 * into the worker.
 */

import path from 'path';
import { EventEmitter } from 'events';

import { unzipSync } from 'fflate';
import tar from 'tar-stream';
import concat from 'concat-stream';

import * as wasmer from '@wasmer/sdk';


namespace PackageManager {
    export interface Volume {
        mkdir(filename: string, options?: {recursive?: boolean}): Promise<void>
        writeFile(filename: string, content: string | Uint8Array): Promise<void>
        readFile(filename: string): Promise<Uint8Array>
        readFile(filename: string, encoding: 'utf-8'): Promise<string>
        readdir(filename: string): Promise<string[]>
        symlink(target: string, source: string): Promise<void>
    }
}

import Volume = PackageManager.Volume;
import { FsHookMaster } from './fs';


class PackageManager extends EventEmitter {

    volume: Volume
    opts: {fastInflate: boolean}

    constructor(volume: Volume) {
        super();
        this.volume = volume;
        this.opts = {fastInflate: true};
    }

    async installFile(filename: string, content: string | Uint8Array | Resource) {
        var c = content instanceof Resource ? await content.fetch() : content;
        return this._installFile(filename, c);
    }

    async _installFile(filename: string, content: string | Uint8Array) {
        await this.volume.mkdir(path.dirname(filename), {recursive: true});
        return this.volume.writeFile(filename, content);
    }

    async installSymlink(filename: string, target: string) {
        await this.volume.mkdir(path.dirname(filename), {recursive: true});
        return this.volume.symlink(target, filename);
    }

    async installZip(rootdir: string, content: Resource | Blob, progress: (p: DownloadProgress) => void = () => {}) {
        var payload = (content instanceof Resource) ? await content.blob(progress) : content,
            ui8a = new Uint8Array(await payload.arrayBuffer());  /** @todo streaming? */

        for (let [filename, content] of Object.entries(unzipSync(ui8a))) {
            let fullpath = path.join(rootdir, filename);
            await this._installFile(fullpath, content);
        }
    }

    async installTar(rootdir: string, content: Resource | Blob, progress: (p: DownloadProgress) => void = () => {}) {
        var payload = (content instanceof Resource) ? await content.blob(progress) : content,
            ui8a = new Uint8Array(await payload.arrayBuffer());  /** @todo streaming? */
        let extract = tar.extract();
        extract.on('entry', async (header, stream, next) => {
            let fullpath = path.join(rootdir, header.name), wait = false;

            switch (header.type) {
            case 'symlink':
                await this.installSymlink(fullpath, header.linkname); break;
            case 'file':
                stream.pipe(concat({encoding: "uint8array"}, async ui8a => {
                    await this.installFile(fullpath, ui8a);//.then(resolve);
                    next();
                }));
                return;  /* calls `next` on its own */
            case 'directory':
                await this.volume.mkdir(fullpath, {recursive: true});
                break;
            default:
                console.warn(`Unrecognized tar entry '${fullpath}' of type '${header.type}'`);
            }
            stream.on('end', () => next());
            stream.resume();
        });
        
        await new Promise((resolve, reject) => {
            extract.on('finish', resolve);
            extract.on('error', reject);
            extract.end(ui8a);
        });
    }

    async installArchive(rootdir: string, content: Resource | Resource[], progress: (p: DownloadProgress) => void = () => {}) {
        if (isMultiple(content)) {
            for (let overlay of content)
                await this.installArchive(rootdir, overlay, progress);
        }
        else if (content.uri.endsWith('.zip') || content.contentType === 'application/zip')
            return this.installZip(rootdir, content, progress);
        else
            return this.installTar(rootdir, content, progress);
    }

    async install(bundle: ResourceBundle, verbose = true) {
        let start = +new Date;
        for (let kv of Object.entries(bundle)) {
            let [filename, content] = kv,
                uri = (content instanceof Resource) ? content.uri : null;

            this.emit('progress', {path: filename, uri, done: false});

            if (!filename.endsWith('/')) {
                // install regular file
                if (isMultiple(content))
                    throw new Error(`cannot install multiple resource into regular file '${filename}'`);
                if (content instanceof SpecialEntry) {
                    if (content instanceof Symlink)
                        await this.installSymlink(filename, content.target);
                    else
                        console.warn(`unexpected entry for file '${filename}';`, content);
                }
                else
                    await this.installFile(filename, content);
            }
            else {
                // install into a directory
                if (content instanceof Resource || isMultiple(content))
                    await this.installArchive(filename, content, (p: DownloadProgress) =>
                        this.emit('progress', {path: filename, uri: uri ?? p.uri, download: p, done: false}));
                else if (content instanceof SpecialEntry) {
                    if (content instanceof Lazily)
                        await this.subinstall(filename, content.bundle);
                    else
                        console.warn(`unexpected entry for directory '${filename}';`, content);
                }
                else
                    await this.volume.mkdir(filename, {recursive: true});
            }
            if (verbose)
                console.log(`%cwrote ${filename} (+${+new Date - start}ms)`, 'color: #99c');

            this.emit('progress', {path: filename, uri, done: true});
        }
    }

    async subinstall(dir: string, bundle: ResourceBundle) {
        if (this.volume instanceof DirectoryVolumeAdapter) {
            await this.volume.mount(dir,
                new DirectoryVolumeAdapter({readonly: true}).withHook(
                    v => this.subpm(v, {dir}).install(bundle)));
        }
        else
            console.warn(`subinstall skipped for '${dir}' (not a Wasmer volume)`);
    }

    /**
     * Create a new `PackageManager` and bind events to the current ones.
     */
    subpm(volume: Volume, props = {}): PackageManager {
        let pm = new PackageManager(volume);
        pm.on('progress',
            ev => this.emit('progress', {...ev, subordinate: props}));
        return pm;
    }
}

type ResourceBundle = {[fn: string]: ResourceContent}
type ResourceContent = string | Uint8Array | Resource | Resource[] | SpecialEntry

abstract class SpecialEntry { }
class Symlink extends SpecialEntry {
    constructor(public target: string) { super(); } 
}
class Lazily extends SpecialEntry {
    constructor(public bundle: ResourceBundle) { super(); }
}

function isMultiple(x: any): x is Resource[] {
    return Array.isArray(x) && x[0] instanceof Resource;
}

class Resource {
    uri: string
    contentType: string

    constructor(uri: string, contentType = 'application/octet-stream') {
        this.uri = uri;
        this.contentType = contentType;
    }

    async arrayBuffer() {
        let fl = await this.file();
        if (fl) return fl;

        return (await fetch(this.uri)).arrayBuffer()
    }

    async blob(progress: (p: DownloadProgress) => void = () => {}) {
        let fl = await this.file();
        if (fl) return new Blob([fl]);

        progress({uri: this.uri, total: 1, downloaded: 0}); /* dummy entry */
        var response = await fetch(this.uri),
            total = +response.headers.get('Content-Length'),
            r = response.body.getReader(), chunks = [], downloaded = 0;
        for(;;) {
            var {value, done} = await r.read();
            if (done) break;
            chunks.push(value);
            downloaded += value.length;
            progress({uri: this.uri, total, downloaded})
        }
        return new Blob(chunks);
    }

    async fetch() {
        return new Uint8Array(
            await this.arrayBuffer()
        );
    }

    async prefetch(progress: (p: DownloadProgress) => void = () => {}) {
        return new ResourceBlob(await this.blob(progress), this.uri);
    }

    /** fast-path when fs is available */
    async file() {
        if (this.uri.startsWith('file://')) {
            const fs = await import('fs').catch<null>(() => null);
            if (fs?.promises?.readFile)
                return fs.promises.readFile(new URL(this.uri).pathname);
        }
    }

}

class ResourceBlob extends Resource {
    _blob: Blob
    constructor(blob: Blob, uri: string = '') {
        super(uri);
        this._blob = blob;
    }
    async blob() { return this._blob; }
}

type DownloadProgress = { uri: string, total: number, downloaded: number };



class DirectoryVolumeAdapter implements Volume {
    root: wasmer.Directory
    options: {readonly?: boolean}

    constructor(options?: DirectoryVolumeAdapter['options'])
    constructor(root: wasmer.Directory, options?: DirectoryVolumeAdapter['options'])

    constructor(...args: any[]) {
        let [root, options]: [wasmer.Directory, DirectoryVolumeAdapter['options']] =
            args[0] instanceof wasmer.Directory ? args as any : [undefined, args[0]];
        this.root = root ?? new wasmer.Directory();
        this.options = options ?? {};
    }

    mkdir(pathname: string, options: {recursive?: boolean} = {}): Promise<void> {
        return options.recursive ? this.root.createDirs(pathname)
                                 : this.root.createDir(pathname);
    }

    writeFile(filename: string, content: string | Uint8Array): Promise<void> {
        return this.options.readonly
            ? this.root.writeFileRO(filename, content)
            : this.root.writeFile(filename, content);
    }

    readFile(filename: string): Promise<Uint8Array>
    readFile(filename: string, encoding: 'utf-8'): Promise<string>

    readFile(filename: string, encoding?: 'utf-8'): Promise<Uint8Array> | Promise<string> {
        return encoding ? this.root.readTextFile(filename)
                        : this.root.readFile(filename);
    }

    async readdir(filename: string) {
        return (await this.root.readDir(filename)).map(e => e.name);
    }

    symlink(target: string, source: string): Promise<void> {
        this.root.softLink(target, source);
        return Promise.resolve();
    }

    withHook(onAccess: (vol: this) => Promise<void>) {
        let master: FsHookMaster = globalThis.fs_hook ?? new FsHookMaster();
        globalThis.fs_hook = master;
        this._installHook(master.add(() => onAccess(this)));
        return this;
    }

    _installHook(populate: number) {
        let hooks = new wasmer.Hooks;
        hooks.populate = populate;
        this.root.setHooks(hooks);
    }

    async mount(dir: string, vol: DirectoryVolumeAdapter) {
        await this.mkdir(path.dirname(dir), {recursive: true});
        this.root.mountDir(dir, vol.root);
    }
}

/**
 * A volume obtained by referring to a subtree within a parent volume.
 * (not secure in any way, does not sanitize `..` elements in paths)
 */
class SubdirectoryVolume implements Volume {
    root: {volume: Volume, dir: string}

    constructor(volume: Volume, rootdir: string) {
        this.root = {volume, dir: rootdir};
    }

    get _() { return this.root.volume; }
    _abs(relpath: string) { return path.join(this.root.dir, relpath); }

    mkdir(filename: string, options?: {recursive?: boolean}): Promise<void> {
        return this._.mkdir(this._abs(filename), options);
    }
    writeFile(filename: string, content: string | Uint8Array): Promise<void> {
        return this._.writeFile(this._abs(filename), content);
    }
    readFile(filename: string): Promise<Uint8Array>
    readFile(filename: string, encoding: 'utf-8'): Promise<string>
    readFile(filename: string, encoding?: 'utf-8'): Promise<Uint8Array> | Promise<string> {
        return this._.readFile(this._abs(filename), encoding);
    }
    readdir(filename: string): Promise<string[]> {
        return this._.readdir(this._abs(filename));
    }
    symlink(target: string, source: string): Promise<void> {
        return this._.symlink(this._abs(target), this._abs(source));
    }
}


export { PackageManager, Resource, ResourceBlob, ResourceBundle, Symlink, Lazily,
         DownloadProgress, DirectoryVolumeAdapter, SubdirectoryVolume }