import { Volume } from 'memfs/lib/volume';
import { Node, Link } from 'memfs/lib/node';
import assert from 'assert';



class SharedVolume extends Volume {

    dev: BlockDevice
    root: LinkSharedVolume
    inodes: {[ino: number]: NodeSharedVolume}

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
            console.log('+ created link', parent.ino, name, link.ino);
        }
        link.push();
        return link;
    }

    deleteLink(link: LinkSharedVolume) {
        console.log('deleted link', link.parent.ino, link.getName(), link.ino);
        var parent = link.parent, ret = super.deleteLink(link);
        parent.push();
        return ret;
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
    raw: ArrayBuffer

    constructor(props: BlockDeviceProps = {}) {
        this.raw = props.raw || new SharedArrayBuffer(props.size || 1 << 20);
        this.blockSize = props.blockSize || 1 << 10;
    }

    static from(props: BlockDeviceProps) {
        return new BlockDevice(props);
    }

    to(): BlockDeviceProps {
        return {raw: this.raw, blockSize: this.blockSize};
    }

    get(blockNo: number) {
        var offset = blockNo * this.blockSize;
        return new Uint8Array(this.raw, offset, this.blockSize);
    }

    readText(blockNo: number, startIndex = 0) {
        var buf = this.get(blockNo);
        buf = buf.slice(startIndex, buf.indexOf(0, startIndex));
        return {buf: new TextDecoder('utf-8').decode(buf),
                size: buf.length + 1};
    }

    read(blockNo: number, startIndex = 0, size?: number) {
        var buf = this.get(blockNo).slice(startIndex,
                        (size >= 0) ? startIndex + size : undefined);
        return {buf, size: buf.length};
    }

    writeText(blockNo: number, value: string, startIndex = 0) {
        // always utf-8 (also, for some reason TextEncoder doesn't work)
        return this.write(blockNo, Buffer.from(value + '\0', 'utf-8'), startIndex);
    }

    write(blockNo: number, value: Uint8Array, startIndex = 0) {
        this.get(blockNo).set(value, startIndex);
        return value.length;
    }

}

type BlockDeviceProps = {
    blockSize?: number,
    size?: number,
    raw?: ArrayBuffer
};


class NodeSharedVolume extends Node {

    vol: SharedVolume
    _link?: LinkSharedVolume

    constructor(vol: SharedVolume, ino: number, perm?: number) {
        super(ino, perm)
        this.vol = vol;
        this._link = null;
        console.log('created inode', this);
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
            var {header} = this._read();  // read first in case there is link data too
            Object.assign(header, {p: this.perm, m: this.mode});
            if (this.buf) header.z = this.buf.length;
            this._write(header, this.buf);
            console.log('+ push node', this.ino, header);
        }        
    }

    pull() {
        var blk = this.vol.dev.get(this.ino);
        if (blk[0] != 0) {
            var {header, buf} = this._read();
            console.log('- pull node', this.ino, header, buf);
            this.perm = header.p;
            this.mode = header.m;
            this.buf = buf ? Buffer.from(buf) : undefined;
        }
    }

    _read(): {header: InodeData, buf?: Uint8Array} {
        var {buf: json, size} = this.vol.dev.readText(this.ino),
            header = JSON.parse(<string>json),
            {buf=undefined} = (header.z >= 0) ? 
                this.vol.dev.read(this.ino, size, header.z) : {};
        return {header, buf};
    }

    _write(header: InodeData, buf?: Uint8Array) {
        var headerJson = JSON.stringify(header),
            wrc = this.vol.dev.writeText(this.ino, headerJson);
        if (buf)
            this.vol.dev.write(this.ino, buf, wrc);
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
            console.log('+ push link', this.ino, data);
        }
    }

    pull() {
        var blk = this.vol.dev.get(this.ino);
        if (blk[0] != 0) {
            var data = this._read();
            console.log('- pull link', this.ino, data);
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
