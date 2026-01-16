/**
 * The package manager is not part of the kernel per se,
 * but a worker without some sensible way to install packages is rather
 * useless, and so this functionality is here so that it can get compiled
 * into the worker.
 */

import { EventEmitter } from 'events';
import path from 'path';

import { unzipSync } from 'fflate';
import tar from 'tar-stream';
import concat from 'concat-stream';

import * as wasmer from '@wasmer/sdk';


namespace PackageManager {
    export interface Volume {
        mkdir(filename: string, options: {recursive: boolean}): Promise<void>
        writeFile(filename: string, content: string | Uint8Array): Promise<void>
        link(filename: string, target: string): Promise<void>
    }
}

import Volume = PackageManager.Volume;


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
        return this.volume.link(filename, target);
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
        let extract = tar.extract(),
            pending = [];
        extract.on('entry', async (header, stream, next) => {
            let fullpath = `${rootdir}/${header.name}`, wait = false;

            switch (header.type) {
            case 'symlink':
                pending.push(this.installSymlink(fullpath, header.linkname)); break;
            case 'file':
                stream.pipe(concat(ui8a => {
                    pending.push(this.installFile(fullpath, ui8a));
                }));
                break;
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
        await Promise.all(pending);
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
                await this.installFile(filename, content);
            }
            else {
                // install into a directory
                if (content instanceof Resource || isMultiple(content))
                    await this.installArchive(filename, content, (p: DownloadProgress) =>
                        this.emit('progress', {path: filename, uri: uri ?? p.uri, download: p, done: false}));
                else
                    await this.volume.mkdir(filename, {recursive: true});
            }
            if (verbose)
                console.log(`%cwrote ${filename} (+${+new Date - start}ms)`, 'color: #99c');

            this.emit('progress', {path: filename, uri, done: true});
        }
    }
}

type ResourceBundle = {[fn: string]: string | Uint8Array | Resource | Resource[]}

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
        return (await fetch(this.uri)).arrayBuffer()
    }

    async blob(progress: (p: DownloadProgress) => void = () => {}) {
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

    constructor(root: wasmer.Directory) {
        this.root = root;
    }

    mkdir(pathname: string, options: { recursive: boolean; }): Promise<void> {
        return options.recursive ? this.root.createDirs(pathname)
                                 : this.root.createDir(pathname);
    }

    writeFile(filename: string, content: string | Uint8Array): Promise<void> {
        return this.root.writeFileRO(filename, content);
    }

    link(filename: string, target: string): Promise<void> {
        /** @todo */
        throw new Error(`symlinks not supported in this medium (installing '${filename}')`);        
    }

    lazyInstall(path: string = "/", resource: Resource) {
        let hid = ++DirectoryVolumeAdapter.hid;
    
        let hooks = new wasmer.Hooks;
        hooks.populate = hid;
        this.root.setHooks(hooks);

        return new Map([
            [hid, () =>
                new PackageManager(this).installArchive(path, resource)
            ]
        ]);
    }

    static hid = 0;
}


export { PackageManager, Resource, ResourceBlob, ResourceBundle, DownloadProgress,
         DirectoryVolumeAdapter }