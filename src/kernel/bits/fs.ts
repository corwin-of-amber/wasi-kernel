
const constants = {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    S_IFMT: 61440,
    S_IFREG: 32768,
    S_IFDIR: 16384,
    S_IFCHR: 8192,
    S_IFBLK: 24576,
    S_IFIFO: 4096,
    S_IFLNK: 40960,
    S_IFSOCK: 49152,
    O_CREAT: 512,
    O_EXCL: 2048,
    O_NOCTTY: 131072,
    O_TRUNC: 1024,
    O_APPEND: 8,
    O_DIRECTORY: 1048576,
    O_NOFOLLOW: 256,
    O_SYNC: 128,
    O_DSYNC: 4194304,
    O_SYMLINK: 2097152,
    O_NONBLOCK: 4,
    S_IRWXU: 448,
    S_IRUSR: 256,
    S_IWUSR: 128,
    S_IXUSR: 64,
    S_IRWXG: 56,
    S_IRGRP: 32,
    S_IWGRP: 16,
    S_IXGRP: 8,
    S_IRWXO: 7,
    S_IROTH: 4,
    S_IWOTH: 2,
    S_IXOTH: 1,
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    UV_FS_COPYFILE_EXCL: 1,
    COPYFILE_EXCL: 1 };


class FsServices {

    constants = constants;

    strmode(mode: number) {
        const c = constants;
        let ret = '';

        //switch (mode & c.S_IFMT) {
        let d = { [c.S_IFDIR]: 'd', [c.S_IFCHR]: 'c', [c.S_IFBLK]: 'b', 
                  [c.S_IFREG]: '-', [c.S_IFLNK]: 'l', [c.S_IFSOCK]: 's',
                  [c.S_IFIFO]: 'p' };
        ret += d[mode & c.S_IFMT] || '?';
        /* user */
        ret += (mode & c.S_IRUSR) ? 'r' : '-';
        ret += (mode & c.S_IWUSR) ? 'w' : '-';
        ret += (mode & c.S_IXUSR) ? 'x' : '-';  /* @todo: ISUID? */
        /* group */
        ret += (mode & c.S_IRGRP) ? 'r' : '-';
        ret += (mode & c.S_IWGRP) ? 'w' : '-';
        ret += (mode & c.S_IXGRP) ? 'x' : '-';  /* @todo: ISGID? */
        /* other */
        ret += (mode & c.S_IROTH) ? 'r' : '-';
        ret += (mode & c.S_IWOTH) ? 'w' : '-';
        ret += (mode & c.S_IXOTH) ? 'x' : '-';  /* @todo: ISVTX? */

        return ret;
    }   
 
}

const fs = new FsServices;

export {fs}
