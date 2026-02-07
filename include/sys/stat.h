#pragma once

#include_next <sys/stat.h>

// Need to override wasi-libc's implementation of `stat`.
// This is unfortunate but there is no way around https://github.com/WebAssembly/wasi-libc/issues/164.

#define __wasik_override_stat

#ifndef WASIK_STAT_UMASK
#define WASIK_STAT_UMASK 0755
#endif

WASI_C_START


static inline int __wasik_stat_polyfill(int rc, struct stat *buf) {
    if (rc == 0) buf->st_mode |= WASIK_STAT_UMASK;
    return rc;
}

__attribute__((unused))
static int __wasik_fstat(int filedes, struct stat *buf)
    { return __wasik_stat_polyfill(fstat(filedes, buf), buf); }
__attribute__((unused))
static int __wasik_stat(const char *restrict path, struct stat *restrict buf)
    { return __wasik_stat_polyfill(stat(path, buf), buf); }
__attribute__((unused))
static int __wasik_lstat(const char *restrict path, struct stat *restrict buf)
    { return __wasik_stat_polyfill(lstat(path, buf), buf); }
__attribute__((unused))
static int __wasik_fstatat(int fd, const char *path, struct stat *buf, int flag)
    { return __wasik_stat_polyfill(fstatat(fd, path, buf, flag), buf); }


#ifdef __wasik_override_stat
#undef fstat
#undef stat
#undef lstat
#undef fstatat

#define fstat(X,Y) __wasik_fstat(X,Y)
#define stat(X,Y) __wasik_stat(X,Y)
#define lstat(X,Y) __wasik_lstat(X,Y)
#define fstatat(F,X,Y,L) __wasik_fstatat(F,X,Y,L)
#endif


int
    mknod(const char *path, mode_t mode, dev_t dev);

int
    mknodat(int fd, const char *path, mode_t mode, dev_t dev);


WASI_C_END

