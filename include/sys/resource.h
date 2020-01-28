#pragma once

#include_next <sys/resource.h>

WASI_C_START


typedef unsigned int rlim_t;
struct rlimit { rlim_t rlim_max; rlim_t rlim_cur; };
static const int RLIM_INFINITY = 0;
static const int RLIMIT_STACK = 0;

int
     getrlimit(int resource, struct rlimit *rlp);

int
     setrlimit(int resource, const struct rlimit *rlp);


WASI_C_END
