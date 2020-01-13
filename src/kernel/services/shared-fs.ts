import { Volume } from 'memfs/lib/volume';
import { Node, Link } from 'memfs/lib/node';
import assert from 'assert';



class SharedVolume extends Volume {

    dev: BlockDevice
    inodes: {[ino: number]: NodeSharedVolume}

    constructor(props: SharedVolumeProps = {}) {
        let vol: SharedVolume;
        class NodeInner extends NodeSharedVolume {
            constructor(ino: number, perm?: number) {
                super(vol, ino, perm)
            }
        }

        super({
            Node: NodeInner,
            Link: LinkSharedVolume
        });
        this.dev = BlockDevice.from(props.dev);

        vol = this;
        (<NodeInner>this.inodes[this.root.ino]).vol = vol;
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

    deleteLink(link: Link) {
        console.log('deleted link', link.parent.ino, link.getName(), link.ino);
        return super.deleteLink(link);
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
        let offset = blockNo * this.blockSize;
        return new Uint8Array(this.raw, offset, this.blockSize);
    }

    read(blockNo: number, startIndex: number = 0, encoding?: string) {
        let buf = this.get(blockNo);
        if (encoding) {
            buf = buf.slice(startIndex, buf.indexOf(0, startIndex));
            return new TextDecoder(encoding).decode(buf);
        }
        else {
            return Uint8Array.from(buf);
        }
    }

    write(blockNo: number, value: string) {
        // always utf-8 (also, for some reason TextEncoder doesn't work)
        var a = Buffer.from(value + '\0', 'utf-8');
        this.get(blockNo).set(a, 0);
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
        console.log('sync inode', this.ino, this);
    }
  
    del() {
        super.del();
    }

    push() {
        if (this.vol.dev) {
            var data = {p: this.perm, m: this.mode};
            this.vol.dev.write(this.ino, JSON.stringify(data));
            console.log('+ push node', this.ino, data);
        }        
    }

    pull() {
        var blk = this.vol.dev.get(this.ino);
        if (blk[0] != 0) {
            var data = this._read();
            this.perm = data.p;
            this.mode = data.m;
        }
    }

    _read(): InodeData {
        var json = <string>this.vol.dev.read(this.ino, 0, 'utf-8');
        return JSON.parse(json);
    }

}


class LinkSharedVolume extends Link {

    vol: SharedVolume

    constructor(vol: SharedVolume, parent: Link, name: string) {
        super(vol, parent, name);
        return <any>new Proxy(this, new ProxyHandlers.LinkHandler());
    }

    createChild(name: string, node: Node = this.vol.createNode()): LinkSharedVolume {
        const link = new LinkSharedVolume(this.vol, this, name);
        link.setNode(node);
        this.setChild(name, link);
        this.push();
        return link;
    }

    push() {
        if (this.vol.dev) {
            var c = {};
            for (let [name, link] of Object.entries(this.children)) {
                c[name] = {ino: link.ino};
            }
            var node = this.getNode(),
                data = {c, p: node.perm, m: node.mode};
            this.vol.dev.write(this.ino, JSON.stringify(data));
            console.log('+ push link', this.ino, data);
            //console.log(this.vol.dev.get(this.ino));
        }
    }

    pull() {
        var blk = this.vol.dev.get(this.ino);
        if (blk[0] != 0) {
            var data = this._read();
            console.log('+ pull link', this.ino, data);
            for (let [name, linkData] of Object.entries(data.c)) {
                if (typeof linkData.ino === 'number') {
                    let inode = this.vol.getNodeShared(linkData.ino);
                    this.children[name] = inode.getLink(this, name);
                }
            }
            console.log(this.children);
        }
    }

    _read(): LinkInodeData {
        var json = <string>this.vol.dev.read(this.ino, 0, 'utf-8');
        return JSON.parse(json);
    }
}


type InodeData = {
    p: number
    m: number
};

type LinkInodeData = InodeData & {
    c: {[name: string]: {ino: number}}
};


namespace ProxyHandlers {

    /**
     * Proxy handler for Volume.inodes.
     */
    export class Inodes {
        set(inodes: {}, key: number, inode: any) {
            console.log('inodes', key, '<--', inode);
            inodes[key] = inode;
            return true;
        }
    }

    export class LinkHandler {
        get(link: LinkSharedVolume, name: string) {
            if (name === 'children' && link.vol.dev) {
                console.log('+ get link children', link.vol.dev.read(link.ino));
                link.pull();
            }
            return link[name];
        }
    }

    /**
     * Proxy handler for Link.children.
     */
    export class LinkChildren {
        link: Link;
        constructor(link: LinkSharedVolume) { this.link = link; }

        set(children: {}, name: string, link: Link) {
            console.log('children', this.link.ino, name, '<--', link);
            children[name] = link;
            return true;
        }

        get(children: {}, name: string) {
            console.log('children', this.link.ino, name, '-->');
            return children[name];
        }
    }

}


export { SharedVolume, SharedVolumeProps, BlockDevice, BlockDeviceProps }
