import { EventEmitter } from 'events';
//import { Volume } from 'memfs/lib/volume';
import path from 'path';
//import JSZip from 'jszip';
//import { DEFLATE } from 'jszip/lib/compressions'
//import { inflateRaw } from 'pako';
import tar from 'tar-stream';
import concat from 'concat-stream';
//import { SharedVolume } from 'wasi-kernel';


interface Volume {
    mkdirSync(filename: string, options: {recursive: boolean}): void;
    writeFile(filename: string, content: string | Uint8Array, callback: () => void): void;
}


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
        this.volume.mkdirSync(path.dirname(filename), {recursive: true});
        //if (this.volume instanceof SharedVolume && content instanceof Uint8Array && content.length > (1 << 14))
        //    return this.volume.writeBlob(filename, content);
        //else
        return new Promise<void>(resolve => this.volume.writeFile(filename, content, resolve));
    }

    installSymlink(filename: string, target: string) {
        /*if (this.volume instanceof SharedVolume) {
            this.volume.createSymlink(target, filename);
        }
        else*/
            throw new Error(`symlinks not supported in this medium (installing '${filename}')`);
    }

    /*
    async installZip(rootdir: string, content: Resource | Blob, progress: (p: DownloadProgress) => void = () => {}) {
        var payload = (content instanceof Resource) ? content.blob(progress) : content;
        var z = await JSZip.loadAsync(payload),
            waitFor = [];
        z.forEach((filename: string, entry: any /*ZipEntry*) => {
            let fullpath = path.join(rootdir, filename);
            waitFor.push((async () => {
                if (this.isSymlink(entry.unixPermissions)) {
                    this.installSymlink(fullpath, await entry.async('text'));
                }
                else if (entry.dir)
                    this.volume.mkdirSync(fullpath, {recursive: true});
                else {
                    let ui8a = this.opts.fastInflate && entry._data.compression == DEFLATE
                         ? this._inflateFast(entry)
                         : await entry.async('uint8array');
                    await this._installFile(fullpath, ui8a)
                }
            })());
        });
        await Promise.all(waitFor);
    }

    _inflateFast(entry: any) {
        return inflateRaw(entry._data.compressedContent);
    }*/

    async installTar(rootdir: string, content: Resource | Blob, progress: (p: DownloadProgress) => void = () => {}) {
        var payload = (content instanceof Resource) ? await content.blob(progress) : content,
            ui8a = new Uint8Array(await payload.arrayBuffer());  /** @todo streaming? */
        let extract = tar.extract(),
            pending = [];
        extract.on('entry', (header, stream, next) => {
            let fullpath = `${rootdir}/${header.name}`, wait = false;

            switch (header.type) {
            case 'symlink':
                this.installSymlink(fullpath, header.linkname); break;
            case 'file':
                stream.pipe(concat(ui8a => {
                    pending.push(this.installFile(fullpath, ui8a));
                }));
                break;
            case 'directory':
                this.volume.mkdirSync(fullpath, {recursive: true});
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
        //else if (content.uri.endsWith('.zip'))
        //    return this.installZip(rootdir, content, progress);
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
                    this.volume.mkdirSync(filename, {recursive: true});
            }
            if (verbose)
                console.log(`%cwrote ${filename} (+${+new Date - start}ms)`, 'color: #99c');

            this.emit('progress', {path: filename, uri, done: true});
        }
    }

    isSymlink(mode: number) {
        return (mode & S_IFMT) === S_IFLNK;
    }

}

type ResourceBundle = {[fn: string]: string | Uint8Array | Resource | Resource[]}

function isMultiple(x: any): x is Resource[] {
    return Array.isArray(x) && x[0] instanceof Resource;
}

class Resource {
    uri: string

    constructor(uri: string) {
        this.uri = uri;
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


// - from fs.constants
const S_IFMT = 0o170000,
      S_IFLNK = 0o120000;



export { PackageManager, Volume, Resource, ResourceBlob, ResourceBundle, DownloadProgress }