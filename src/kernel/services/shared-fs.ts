import { Volume } from 'memfs/lib/volume';
import { Node, Link } from 'memfs/lib/node';



class SharedVolume extends Volume {

    dev: BlockDevice

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
            console.log('created link', parent.ino, name, link.ino);
            parent.sync();
        }
        link.sync();
        return link;
    }

    deleteLink(link: Link) {
        console.log('deleted link', link.parent.ino, link.getName(), link.ino);
        return super.deleteLink(link);
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

    write(blockNo: number, value: string) {
        var a = Buffer.from(value, 'utf-8');
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

    constructor(vol: SharedVolume, ino: number, perm?: number) {
        super(ino, perm)
        this.vol = vol;
        console.log('created inode', this);
    }
    touch() {
        super.touch();
        console.log('sync inode', this.ino, this);
    }
  
    del() {
        super.del();
    }

}


class LinkSharedVolume extends Link {

    vol: SharedVolume

    constructor(vol: SharedVolume, parent: Link, name: string) {
        super(vol, parent, name);
        console.log('created link');
        //this.children = new Proxy(this.children, new ProxyHandlers.LinkChildren(this));
    }

    createChild(name: string, node: Node = this.vol.createNode()): Link {
        const link = new LinkSharedVolume(this.vol, this, name);
        link.setNode(node);
        this.setChild(name, link);
        return link;
    }

    sync() {
        var data = Object.entries(this.children).map(([name, child]) =>
            ({name, ino: child.ino})
        );
        if (this.vol.dev) {
            this.vol.dev.write(this.ino,
                JSON.stringify(data) + '\0');
            console.log(this.ino, data);
            console.log(this.vol.dev.get(this.ino));
        }
    }
}


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

    /**
     * Proxy handler for Link.children.
     */
    export class LinkChildren {
        link: Link;
        constructor(link: Link) { this.link = link; }

        set(children: {}, name: string, link: Link) {
            console.log('children', this.link.ino, name, '<--', link);
            children[name] = link;
            return true;
        }
    }

}


export { SharedVolume, SharedVolumeProps, BlockDevice, BlockDeviceProps }
