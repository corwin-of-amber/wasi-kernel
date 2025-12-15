#pragma once

#include_next <sys/stat.h>

// Need to override wasi-libc's implementation of `stat`.
// This is unfortunate but there is no way around https://github.com/WebAssembly/wasi-libc/issues/164.
/** @todo probably also `fstat`, `fstatat` */
/** @todo still needed with wasi-sdk >= 24 ? */

#if !defined(__wasix__) && !defined(__wasik_override_stat)

#ifdef __wasik_override_stat
#undef stat
#undef lstat
#endif

#ifndef stat
#define stat(X,Y) __wasik_stat(X,Y)
#endif
#ifndef lstat
#define lstat(X,Y) __wasik_lstat(X,Y)
#endif

#endif

WASI_C_START


int
     __wasik_stat(const char *restrict path, struct stat *restrict buf);
int
     __wasik_lstat(const char *restrict path, struct stat *restrict buf);



 int
     mknod(const char *path, mode_t mode, dev_t dev);

 int
     mknodat(int fd, const char *path, mode_t mode, dev_t dev);

WASI_C_END

