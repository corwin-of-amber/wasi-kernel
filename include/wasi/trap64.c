/**
 * This is a hack meant to circumvent a bug in wasm_transformer.
 * Some 64-bit calls cause the transform to fail, producing an invalid
 * wasm output.
 * The relevant calls are wrapped with a thin layer that converts
 * arguments to i32.
 */

#include <wasi/core.h>


#define __WASI_SYSCALL_NAME(name) \
    __attribute__((__import_module__("wasi_unstable"), __import_name__(#name)))


__wasi_errno_t __wasi_fd_readdir$32(
    __wasi_fd_t fd,
    void *buf,
    size_t buf_len,
    int32_t cookie,  /* <-- wrapped to i32 */
    size_t *bufused
) __WASI_SYSCALL_NAME(fd_readdir) __attribute__((__warn_unused_result__));


__wasi_errno_t __wasi_fd_readdir(
    __wasi_fd_t fd,
    void *buf,
    size_t buf_len,
    __wasi_dircookie_t cookie,
    size_t *bufused
) {
    return __wasi_fd_readdir$32(fd, buf, buf_len, cookie, bufused);
}



__wasi_errno_t __wasi_fd_seek$32(
    __wasi_fd_t fd,
    int32_t offset,  /* <-- wrapped to i32 */
    __wasi_whence_t whence,
    __wasi_filesize_t *newoffset
) __WASI_SYSCALL_NAME(fd_seek) __attribute__((__warn_unused_result__));

__wasi_errno_t __wasi_fd_seek(
    __wasi_fd_t fd,
    __wasi_filedelta_t offset,
    __wasi_whence_t whence,
    __wasi_filesize_t *newoffset
) {
    return __wasi_fd_seek$32(fd, offset, whence, newoffset);
}



__wasi_errno_t __wasi_path_open$32(
    __wasi_fd_t dirfd,
    __wasi_lookupflags_t dirflags,
    const char *path,
    size_t path_len,
    __wasi_oflags_t oflags,
    uint32_t fs_rights_base,          /* <-- wrapped to i32 */
    uint32_t fs_rights_inheriting,    /* <-- wrapped to i32 */
    __wasi_fdflags_t fs_flags,
    __wasi_fd_t *fd
) __WASI_SYSCALL_NAME(path_open) __attribute__((__warn_unused_result__));


__wasi_errno_t __wasi_path_open(
    __wasi_fd_t dirfd,
    __wasi_lookupflags_t dirflags,
    const char *path,
    size_t path_len,
    __wasi_oflags_t oflags,
    __wasi_rights_t fs_rights_base,
    __wasi_rights_t fs_rights_inheriting,
    __wasi_fdflags_t fs_flags,
    __wasi_fd_t *fd
) {
    return __wasi_path_open$32(dirfd, dirflags, path, path_len, oflags,
            fs_rights_base, fs_rights_inheriting, fs_flags, fd);
} 


#undef __WASI_SYSCALL_NAME
