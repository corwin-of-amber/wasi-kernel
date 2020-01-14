import { Volume } from 'memfs/lib/volume';
import { Node, Link } from 'memfs/lib/node';
import assert from 'assert';
import { threadId } from 'worker_threads';



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
        this.root.getNode().vol = vol;

        this.debug = console.log;
    }

    static from(props: SharedVolumeProps) {
        return new SharedVolume(props);
    }

    to(): SharedVolumeProps {
        return {dev: this.dev.to()};
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
        return node;    
    }

    getNodeShared(ino: number) {
        return this.inodes[ino] || this._fetchNode(ino);
    }

    _fetchNode(ino: number) {
        var node = <NodeSharedVolume>new this.props.Node(ino);
        this.inodes[ino] = node;
        node.pull();
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
    bitset: Uint8Array;

    constructor(props: BlockDeviceProps = {}) {
        this.raw = props.raw || new SharedArrayBuffer(props.size || 1 << 20);
        this.blockSize = props.blockSize || 1 << 10;
        this.blockCount = this.raw.byteLength / this.blockSize;
        this.bitset = props.bitset || new Uint8Array(new SharedArrayBuffer(this.blockSize * 4));
    }

    static from(props: BlockDeviceProps) {
        return new BlockDevice(props);
    }

    to(): BlockDeviceProps {
        return {raw: this.raw, blockSize: this.blockSize, bitset: this.bitset};
    }

    get(blockNo: number) {
        var offset = blockNo * this.blockSize;
        return new Uint8Array(this.raw, offset, this.blockSize);
    }

    isFree(blockNo: number) {
        return Atomics.load(this.bitset, blockNo) == 0;
    }

    alloc() {
        for (let i = 2; i < this.blockSize; i++) {
            if (Atomics.compareExchange(this.bitset, i, 0, 1) == 0) {
                return i;
            }
        }
        throw new Error("no space left on device");
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
        return this.write(blockNo, Buffer.from(value + '\0', 'utf-8'), offset);
    }

    write(blockNo: number, value: Uint8Array, offset = 0) {
        if (offset + value.length > this.blockSize)
            value = value.subarray(0, this.blockSize - offset);
        this.get(blockNo).set(value, offset);
        return value.length;
    }

}

type BlockDeviceProps = {
    blockSize?: number,
    size?: number,
    raw?: ArrayBuffer,
    bitset?: Uint8Array;
};


class NodeSharedVolume extends Node {

    vol: SharedVolume
    _link?: LinkSharedVolume

    constructor(vol: SharedVolume, ino: number, perm?: number) {
        super(ino, perm)
        this.vol = vol;
        this._link = null;
    }

    getLink(parent?: LinkSharedVolume, name?: string) {
        if (!this._link) {
            assert(parent && name);
            this._link = new LinkSharedVolume(this.vol, parent, name);
            this._link.setNode(this);
        }
        return this._link;
    }

    touch() {
        super.touch();
        this.push();
    }
  
    del() {
        super.del();
    }

    push() {
        if (this.vol.dev) {
            var {header} = this._read(),  // read first in case there is link data too
                buf = this.buf;
            Object.assign(header, {p: this.perm, m: this.mode});
            if (buf) header.z = buf.length;
            this.vol.debug('+ push node', this.ino, header);
            var wrc = this._write(header, buf);
            this._writeTrail(buf, wrc);
        }        
    }

    pull() {
        var blk = this.vol.dev.get(this.ino);
        if (blk[0] != 0) {
            var {header, rdc} = this._read();
            this.vol.debug('- pull node', this.ino, header, buf);
            this.perm = header.p;
            this.mode = header.m;
            if (header.z >= 0) {
                var buf = Buffer.alloc(header.z),
                    offset = this.vol.dev.readInto(this.ino, rdc, header.z, buf, 0);
                if (header.n > 0)
                    this._readTrail(buf, offset);
                this.buf = buf;
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
            var n = this._next().ino;
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
        var node = this._next(),
            {header, rdc} = node._read();
        console.log('read trail', node.ino, header, rdc, offset);
        this.vol.dev.readInto(node.ino, rdc, buf.length - offset, buf, offset);        
    }

    _next() {
        return this.vol.getNodeShared(this.ino + 1);
    }

}


class LinkSharedVolume extends Link {

    vol: SharedVolume
    parent: LinkSharedVolume

    constructor(vol: SharedVolume, parent: Link, name: string) {
        super(vol, parent, name);
        return <any>new Proxy(this, new ProxyHandlers.LinkHandler());
        //this.children = new Proxy(this.children,
        //    new ProxyHandlers.LinkChildren(this));
    }

    createChild(name: string, node: Node = this.vol.createNode()): LinkSharedVolume {
        const link = new LinkSharedVolume(this.vol, this, name);
        link.setNode(node);
        this.setChild(name, link);
        return link;
    }

    setChild(name: string, link?: Link) {
        link = super.setChild(name, link);
        this.push();
        return link;
    }

    deleteChild(link: Link) {
        super.deleteChild(link);
        this.push();
    }

    getNode() {
        return this.vol.getNodeShared(this.ino);
    }

    push() {
        if (this.vol.dev) {
            var c = {};
            for (let [name, link] of Object.entries(this.children)) {
                c[name] = {ino: link.ino};
            }
            var node = this.getNode(),
                data = {c, p: node.perm, m: node.mode};
            this.vol.dev.writeText(this.ino, JSON.stringify(data));
            this.vol.debug('+ push link', this.ino, data);
        }
    }

    pull() {
        var blk = this.vol.dev.get(this.ino);
        if (blk[0] != 0) {
            var data = this._read();
            this.vol.debug('- pull link', this.ino, data);
            for (let [name, linkData] of Object.entries(data.c)) {
                if (typeof linkData.ino === 'number') {
                    let inode = this.vol.getNodeShared(linkData.ino);
                    this.children[name] = inode.getLink(this, name);
                }
            }
        }
    }

    _read(): LinkInodeData {
        var {buf: json} = this.vol.dev.readText(this.ino);
        return JSON.parse(<string>json);
    }
}


type InodeData = {
    p: number
    m: number
    z?: number
    n?: number
};

type LinkInodeData = InodeData & {
    c: {[name: string]: {ino: number}}
};


namespace ProxyHandlers {

    /**
     * Proxy handler for LinkSharedVolume.
     */
    export class LinkHandler {
        get(link: LinkSharedVolume, name: string) {
            if (name === 'children' && link.vol.dev) {
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
