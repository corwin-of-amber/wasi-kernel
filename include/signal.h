#pragma once

#ifndef _WASI_EMULATED_SIGNAL
#define _WASI_EMULATED_SIGNAL
#endif

#include_next <signal.h>

WASI_C_START


typedef int siginfo_t;

union __sigaction_u {
    void    (*__sa_handler)(int);
    void    (*__sa_sigaction)(int, siginfo_t *,
                    void *);
};

struct  sigaction {
    union __sigaction_u __sigaction_u;  /* signal handler */
    sigset_t sa_mask;               /* signal mask to apply */
    int     sa_flags;               /* see signal options below */
};

#define sa_handler      __sigaction_u.__sa_handler
#define sa_sigaction    __sigaction_u.__sa_sigaction

int
    sigaction(int sig, const struct sigaction *restrict act, struct sigaction *restrict oact);
int
    sigwait(const sigset_t *restrict set, int *restrict sig);
int
    sigpending(sigset_t *set);

static const int SIG_BLOCK   =  0;
static const int SIG_UNBLOCK =  1;
static const int SIG_SETMASK =  2;

#ifndef SA_NODEFER

enum __sa_flags {
    SA_NOCLDSTOP,  /* @todo values */
    SA_NOCLDWAIT,
    SA_NODEFER,
    SA_ONSTACK,
    SA_RESETHAND,
    SA_RESTART,
    SA_RESTORER,
    SA_SIGINFO
};

#endif

// Signal numbers
#include <bits/alltypes.h>


WASI_C_END
