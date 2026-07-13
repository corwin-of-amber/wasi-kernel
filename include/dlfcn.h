#pragma once

#ifdef __wasix__
#include_next <dlfcn.h>
#else

WASI_C_START


void*
     dlopen(const char* path, int mode) __WASIK_EXTERNAL_NAME(dlopen);
void*
     dlsym(void* handle, const char* symbol) __WASIK_EXTERNAL_NAME(dlsym);
int
     dlclose(void* handle) __WASIK_EXTERNAL_NAME(dlclose);

extern int __wasi_dlerror_get(char **buf) __WASIK_EXTERNAL_NAME(dlerror_get);

static inline const char* dlerror(void) {
     char *buf = 0;
     __wasi_sorry(buf = (char*)malloc(__wasi_dlerror_get(&buf)));
     return buf;
}

static void *const RTLD_DEFAULT = 0;
static const int RTLD_NOW = 1;
static const int RTLD_LAZY = 2;
static const int RTLD_LOCAL = 4;
static const int RTLD_GLOBAL = 8;


WASI_C_END

#endif