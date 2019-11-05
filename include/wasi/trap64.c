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


void __control_invoke(__control_block_t block, int arg) {
    block(arg);
}


#undef __WASI_SYSCALL_NAME