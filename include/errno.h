#pragma once


#include_next <errno.h>


#ifdef __wasik_dyld__

WASI_C_START

__attribute__((const)) int *__errno_location(void);
#ifdef errno
#undef errno
#endif
#define errno (*__errno_location())

WASI_C_END

#endif