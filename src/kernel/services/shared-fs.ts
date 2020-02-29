import { fs as memfs, Volume } from 'memfs';
import { filenameToSteps } from 'memfs/lib/volume';
import { Node, Link } from 'memfs/lib/node';
import assert from 'assert';



class SharedVolume extends Volume {

    dev: BlockDevice
    root: LinkSharedVolume
    inodes: {[ino: number]: NodeSharedVolume}

    debug: (...a: any[]) => void

    constructor(props: SharedVolumeProps = {}) {
        let vol: SharedVolume;

        class NodeInner {
            constructor(ino: number, perm?: number) {
                return new NodeSharedVolume(vol, ino, perm);
            }
        }

        super({
            Node: NodeInner,
            Link: LinkSharedVolume
        });
        this.dev = BlockDevice.from(props.dev);

        vol = this;

        // root node was created before `vol` was initialized :\
        var rnode = this.root.getNode();
        rnode.vol = this; rnode._link = this.root;

        this.debug = () => {}; // console.log;
    }

    static from(props: SharedVolumeProps) {
        return new SharedVolume(props);
    }

    to(): SharedVolumeProps {
        return {dev: this.dev.to()};
    }

    writeBlob(path: string, buf: Uint8Array) {
        var fd = this.openSync(path, memfs.constants.O_CREAT),
            node = <NodeSharedVolume>this.fds[fd].node,
            blob = this.dev.allocBlob(buf.length);
        blob.set(buf, 0);
        node.setBlob(blob);
        this.closeSync(fd);
    }

    createLink(parent?: LinkSharedVolume, name?: string, isDirectory?: boolean, perm?: number): Link  {
        const link = <LinkSharedVolume>super.createLink(parent, name, isDirectory, perm);
        if (parent) {
            this.debug('+ created link', parent.ino, name, link.ino);
        }
        link.push();
        return link;
    }

    deleteLink(link: LinkSharedVolume) {
        this.debug('deleted link', link.parent.ino, link.getName(), link.ino);
        var parent = link.parent, ret = super.deleteLink(link);
        parent.push();
        return ret;
    }

    createNode(isDirectory: boolean = false, perm?: number): NodeSharedVolume {
        if (!this.dev) return <NodeSharedVolume>super.createNode(isDirectory, perm);
        const node = <NodeSharedVolume>new this.props.Node(this.dev.alloc(), perm);
        if (isDirectory) node.setIsDirectory();
        this.inodes[node.ino] = node;
        node.push();
        return node;    
    }

    getNodeShared(ino: number) {
        return this.inodes[ino] || this._fetchNode(ino);
    }

    createSymlink(target: string, filename: string) {
        this.symlinkSync('', filename);
        var link = this.getLink(filenameToSteps(filename));

        var steps = target.split('/');
        if (steps[0] == '') steps.splice(0, 1);
        else steps.splice(0, 0, '.')
        link.getNode().makeSymlink(steps);
        return link;
    }

    /**
     * Overriding this from memfs Volume to support relative symlinks.
     */
    getResolvedLink(filenameOrSteps: string | string[]): Link | null {
        let steps: string[] = typeof filenameOrSteps === 'string' ? filenameToSteps(filenameOrSteps) : filenameOrSteps;
    
        let link: Link = this.root;

        for (let i = 0; i < steps.length;) {
            const step = steps[i],
                  child = link.getChild(step);
            if (!child) return null;
        
            const node = child.getNode();
            if (node.isSymlink()) {
                steps = node.symlink.concat(steps.slice(i + 1));
                i = 0;
                if (steps[0] !== '.') {
                    link = this.root;
                    continue;
                }
            }
            else
                link = child;

            i++;
        }
    
        return link;
    }
          
    _fetchNode(ino: number) {
        var node = <NodeSharedVolume>new this.props.Node(ino);
        this.inodes[ino] = node;
        return node;
    }
}

type SharedVolumeProps = {
    dev?: BlockDeviceProps
};


class BlockDevice {

    blockSize: number
    blockCount: number
    raw: ArrayBuffer
    bitset: Uint8Array

    cursors: Uint32Array

    constructor(props: BlockDeviceProps = {}) {
        this.raw = props.raw || new SharedArrayBuffer(props.size || 1 << 20);
        this.blockSize = props.blockSize || 1 << 10;
        this.blockCount = this.raw.byteLength / this.blockSize;
        this.bitset = props.bitset || new Uint8Array(new SharedArrayBuffer(this.blockCount));
        this.cursors = props.cursors || new Uint32Array(new SharedArrayBuffer(3 * 4));
        if (!props.cursors) {
            this.blockCursor = 2;
            this.boundaryCursor = 2;
            this.blobCursor = this.raw.byteLength;
        }
    }

    static from(props: BlockDeviceProps) {
        return new BlockDevice(props);
    }

    to(): BlockDeviceProps {
        return {raw: this.raw, blockSize: this.blockSize, bitset: this.bitset,
                cursors: this.cursors};
    }

    get(blockNo: number) {
        var offset = blockNo * this.blockSize;
        return new Uint8Array(this.raw, offset, this.blockSize);
    }

    isFree(blockNo: number) {
        return Atomics.load(this.bitset, blockNo) == 0;
    }

    // Cursor accessors
    // (not atomic, for performance :\)
    get blockCursor()              { return this.cursors[0]; }
    set blockCursor(i: number)     { this.cursors[0] = i; }
    get boundaryCursor()           { return this.cursors[1]; }
    set boundaryCursor(i: number)  { this.cursors[1] = i; }
    get blobCursor()               { return this.cursors[2]; }
    set blobCursor(i: number)      { this.cursors[2] = i; }

    alloc() {
        let high = this.blobCursor / this.blockSize;
        for (let i = this.blockCursor; i < high; i++) {
            if (this.bitset[i] == 0 && 
                Atomics.compareExchange(this.bitset, i, 0, 1) == 0) {
                this.blockCursor = i;
                this.boundaryCursor = Math.max(this.boundaryCursor, i + 1);
                return i;
            }
        }
        throw new Error("no space left on device");
    }

    allocBlob(size: number) {
        var offset = this.blobCursor - size;
        if (offset < this.boundaryCursor * this.blockSize)
            throw new Error("no space left on device");
        this.blobCursor = offset;
        return this.getBlob(offset, size);
    }

    getBlob(offset: number, size: number): Buffer {
        var blob = new Uint8Array(this.raw, offset, size);
        Object.setPrototypeOf(blob, Buffer.prototype)
        return blob as Buffer;
    }

    readText(blockNo: number, offset = 0) {
        var buf = this.get(blockNo);
        buf = buf.slice(offset, buf.indexOf(0, offset));
        return {buf: new TextDecoder('utf-8').decode(buf),
                size: buf.length + 1};
    }

    read(blockNo: number, offset = 0, size?: number) {
        var buf = this.get(blockNo).slice(offset,
                        (size >= 0) ? offset + size : undefined);
        return {buf, size: buf.length};
    }

    readInto(blockNo: number, offset: number, size: number,
             buf: Uint8Array, at: number) {
        var a = this.get(blockNo).subarray(offset, offset + size);
        buf.set(a, at);
        return a.length;
    }

    writeText(blockNo: number, value: string, offset = 0) {
        // always utf-8 (also, for some reason TextEncoder doesn't work)
        var bytes = Buffer.from(value + '\0', 'utf-8');
        if (bytes.length + offset > this.blockSize) {
            throw new Error(`inode text overflow (block=${blockNo}, length=${bytes.length})`);
        }
        return this.write(blockNo, bytes, offset);
    }

    write(blockNo: number, value: Uint8Array, offset = 0) {
        if (offset + value.length > this.blockSize)
            value = value.subarray(0, this.blockSize - offset);
        this.get(blockNo).set(value, offset);
        return value.length;
    }

}

type BlockDeviceProps = {
    blockSize?: number
    size?: number
    raw?: ArrayBuffer
    bitset?: Uint8Array
    cursors?: Uint32Array
};


class NodeSharedVolume extends Node {

    vol: SharedVolume
    ver: number
    isBlob: boolean
    _link?: LinkSharedVolume

    constructor(vol: SharedVolume, ino: number, perm?: number) {
        super(ino, perm)
        this.vol = vol;
        this.ver = 0;
        this.isBlob = false;
        this._link = null;
    }

    setModeProperty(property: number) {
        super.setModeProperty(property);
        // parent class implementation does not call touch()
        this.ver++;
        this.push();
    }

    getLink(parent?: LinkSharedVolume, name?: string) {
        if (!this._link) {
            assert(parent && name);
            this._link = new LinkSharedVolume(this.vol, parent, name);
            this._link.setNode(this);
        }
        return this._link;
    }

    setBlob(blob: Buffer) {
        this.buf = blob;
        this.isBlob = true;
        this.touch();
    }

    touch() {
        super.touch();
        this.ver++;
        this.push();
    }
  
    del() {
        super.del();
    }

    push() {
        if (this.vol && this.vol.dev) {
            var blk = this.vol.dev.get(this.ino),
                header: InodeData = {p: this.perm, m: this.mode, v: this.ver},
                buf = this.buf;
            if (blk[0] != 0)
                header = Object.assign(this._read().header, header);  // in case there is link data too
            if (buf) header.z = buf.length;
            if (this.isBlob) {
                header.blob = [buf.byteOffset];
                buf = undefined;
            }
            if (this.symlink) {
                header.symlink = this.symlink;
            }
            this.vol.debug('+ push node', this.ino, header);
            var wrc = this._write(header, buf);
            this._writeTrail(buf, wrc);
        }        
    }

    pull() {
        if (!this.vol) return;
        var blk = this.vol.dev.get(this.ino);
        if (blk[0] != 0) {
            var {header, rdc} = this._read();
            this.vol.debug('- pull node', this.ino, header);
            this.perm = header.p;
            this.mode = header.m;
            this.symlink = header.symlink;
            if (this.symlink)
                console.log('symlink', this.symlink);
            if (this.ver != header.v) {
                this.ver = header.v;
                if (header.z >= 0) {
                    if (header.blob) {
                        this.buf = this.vol.dev.getBlob(header.blob[0], header.z);
                        this.isBlob = true;
                    }
                    else {
                        var buf = Buffer.alloc(header.z),
                            offset = this.vol.dev.readInto(this.ino, rdc, header.z, buf, 0);
                        if (header.n > 0)
                            this._readTrail(buf, offset);
                        this.buf = buf;
                        this.isBlob = false;
                    }
                }
            }
        }
    }

    _read(): {header: InodeData, rdc?: number} {
        var {buf: json, size} = this.vol.dev.readText(this.ino),
            header = JSON.parse(json);
        return {header, rdc: size};
    }

    _write(header: InodeData, buf?: Uint8Array) {
        var wrc = this._writeJson(header || {});
        if (buf && wrc + buf.length > this.vol.dev.blockSize) {
            var n = this._next(header).ino;
            wrc = this._writeJson(Object.assign({}, header, {n}));
        }
        return buf ?
            this.vol.dev.write(this.ino, buf, wrc) : 0;
    }

    _writeJson(obj: {}) {
        return this.vol.dev.writeText(this.ino, JSON.stringify(obj));
    }

    _writeTrail(buf: Uint8Array, offset: number) {
        var node: NodeSharedVolume = this;
        while (buf && offset < buf.length) {
            buf = buf.subarray(offset);
            node = node._next();
            offset = node._write(null, buf);
            assert(offset > 0);
        }
    }

    _readTrail(buf: Uint8Array, offset: number) {
        var node: NodeSharedVolume = this;
        //console.warn("read trail", this.ino);
        while (offset < buf.length) {
            node = node._next();
            var {header, rdc} = node._read();
            rdc = this.vol.dev.readInto(node.ino, rdc, buf.length - offset, buf, offset);
            assert(rdc > 0);
            offset += rdc;
            if (!(header.n >= 0)) break;
        }
        assert(offset == buf.length);
    }

    _next(header?: InodeData) {
        if (!header) header = this._read().header;
        return header.n >= 0 ? 
            this.vol.getNodeShared(header.n) : this.vol.createNode();
    }

}


class LinkSharedVolume extends Link {

    vol: SharedVolume
    parent: LinkSharedVolume
    node: NodeSharedVolume

    ver: number
    _dirty: boolean

    constructor(vol: SharedVolume, parent: Link, name: string) {
        super(vol, parent, name);
        this.ver = 0;
        this._dirty = false;
        return <any>new Proxy(this, new ProxyHandlers.LinkHandler());
        //this.children = new Proxy(this.children,
        //    new ProxyHandlers.LinkChildren(this));
    }

    createChild(name: string, node: NodeSharedVolume = this.vol.createNode()): LinkSharedVolume {
        this._dirty = true;
        const link = new LinkSharedVolume(this.vol, this, name);
        link.setNode(node);
        this.setChild(name, link);
        return link;
    }

    setChild(name: string, link?: Link) {
        this._dirty = true;
        link = super.setChild(name, link);
        this.touch();
        return link;
    }

    deleteChild(link: Link) {
        this._dirty = true;
        super.deleteChild(link);
        this.touch();
    }

    touch() {
        this.vol.getNodeShared(this.ino).ver++;
        this.push();
    }

    setNode(node: NodeSharedVolume) {
        super.setNode(node);
        node._link = this;   // need also the backward link
    }

    getNode() {
        const node = this.node;
        assert(node, 'LinkSharedVolume.node is unset');
        node.pull();
        return node;
    }

    push() {
        if (this.vol.dev) {
            var c: LinkData = {};
            for (let [name, link] of Object.entries(this.children)) {
                c[name] = {ino: link.ino};
            }
            var node = this.getNode(),
                data = JSON.stringify(c);
            this.vol.debug('+ push link', this.ino, data);
            node.buf = Buffer.from(data);
            node.ver++;
            node.push();
            this.ver = node.ver;
            this._dirty = false;
        }
    }

    pull() {
        var blk = this.vol.dev.get(this.ino);
        if (blk[0] != 0) {
            var node = this.getNode();
            node.pull();
            if (node.isDirectory() && node.buf && node.ver !== this.ver) {
                var c: LinkData = JSON.parse(node.buf.toString('utf-8'));
                this.vol.debug('- pull link', this.ino, c);
                var children = {};
                for (let [name, linkData] of Object.entries(c || {})) {
                    if (typeof linkData.ino === 'number') {
                        let inode = this.vol.getNodeShared(linkData.ino);
                        children[name] = inode.getLink(this, name);
                    }
                }
                this.children = children;
                this.ver = node.ver;
                this._dirty = false;
            }
        }
    }

}


type InodeData = {
    p: number
    m: number
    z?: number
    n?: number
    v?: number
    symlink?: string[]
    blob?: [number]
};

type LinkData = {[name: string]: {ino: number}};


namespace ProxyHandlers {

    /**
     * Proxy handler for LinkSharedVolume.
     */
    export class LinkHandler {
        get(link: LinkSharedVolume, name: string) {
            if (name === 'children' && link.vol.dev && !link._dirty) {
                link.pull();
            }
            return link[name];
        }
    }

    /**
     * Proxy handler for LinkSharedVolume.children.
     * (currently not in use as it seems to make things slower.)
     */
    export class LinkChildren {
        link: LinkSharedVolume;
        constructor(link: LinkSharedVolume) { this.link = link; }

        getOwnPropertyDescriptor(children: {}, name: string) {
            this.link.pull();
            return children.hasOwnProperty(name) ? 
                {configurable: true, enumerable: true} : undefined;
        }

        get(children: {}, name: string) {
            this.link.pull();
            return children[name];
        }

        set(children: {}, name: string, value: any) {
            // this is needed to prevent getOwnPropertyDescriptor from being
            // called recursively from LinkSharedVolume.pull()
            children[name] = value;
            return true;
        }
    }

}


export { SharedVolume, SharedVolumeProps, BlockDevice, BlockDeviceProps }
