#pragma once

#include_next <sys/stat.h>

// Need to override wasi-libc's implementation of `stat`.
// This is unfortunate but there is no way around https://github.com/WebAssembly/wasi-libc/issues/164.
/** @todo probably also `fstat`, `fstatat` */
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


WASI_C_START


int
     __wasik_stat(const char *restrict path, struct stat *restrict buf);
int
     __wasik_lstat(const char *restrict path, struct stat *restrict buf);


WASI_C_END