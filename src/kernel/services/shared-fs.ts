import { Volume } from 'memfs/lib/volume';
import { Link } from 'memfs/lib/node';



class SharedVolume extends Volume {

    linksMap: Map<number, Link> = new Map();

    constructor(props?: {}) {
        super(props);
        this._putLink(this.root);
        SharedVolume._hook(this);
    }

    _putLink(link: Link) {
        this.linksMap.set(link.ino, link);
    }

    static _hook(vol: Volume) {
        vol.inodes = new Proxy(vol.inodes, new ProxyHandlers.Inodes);
        vol.root.children = new Proxy(vol.root.children, new ProxyHandlers.LinkChildren(vol.root));
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


export { SharedVolume }
