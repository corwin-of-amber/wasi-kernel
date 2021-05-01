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

int
     getpriority(int which, id_t who);
int
     setpriority(int which, id_t who, int prio);

/* constants for `getrlimit`, `setrlimit` */
#define RLIMIT_CPU     0
#define RLIMIT_FSIZE   1
#define RLIMIT_DATA    2
#define RLIMIT_STACK   3
#define RLIMIT_CORE    4
#define RLIMIT_RSS     5
#define RLIMIT_NPROC   6
#define RLIMIT_NOFILE  7
#define RLIMIT_MEMLOCK 8
#define RLIMIT_AS      9
#define RLIMIT_LOCKS   10
#define RLIMIT_SIGPENDING 11
#define RLIMIT_MSGQUEUE 12
#define RLIMIT_NICE    13
#define RLIMIT_RTPRIO  14
#define RLIMIT_RTTIME  15
#define RLIMIT_NLIMITS 16

#define RLIM_NLIMITS RLIMIT_NLIMITS


WASI_C_END
