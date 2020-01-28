#pragma once

/* (from Darwin) */

#include <sys/resource.h>   /* for struct rusage */

WASI_C_START

/*
 * Option bits for the third argument of wait4.  WNOHANG causes the
 * wait to not hang if there are no stopped or terminated processes, rather
 * returning an error indication in this case (pid==0).  WUNTRACED
 * indicates that the caller should receive status about untraced children
 * which stop due to signals.  If children are stopped and a wait without
 * this option is done, it is as though they were still running... nothing
 * about them is returned.
 */
#define WNOHANG         0x00000001  /* [XSI] no hang in wait/no child to reap */
#define WUNTRACED       0x00000002  /* [XSI] notify on stop, untraced child */

/*
 * Macros to test the exit status returned by wait
 * and extract the relevant values.
 */
#define _W_INT(i)       (i)
#define WCOREFLAG       0200

/* These macros are permited, as they are in the implementation namespace */
#define _WSTATUS(x)     (_W_INT(x) & 0177)
#define _WSTOPPED       0177            /* _WSTATUS if process is stopped */

/*
 * [XSI] The <sys/wait.h> header shall define the following macros for
 * analysis of process status values
 */
#define WEXITSTATUS(x)  ((_W_INT(x) >> 8) & 0x000000ff)
/* 0x13 == SIGCONT */
#define WSTOPSIG(x)     (_W_INT(x) >> 8)
#define WIFCONTINUED(x) (_WSTATUS(x) == _WSTOPPED && WSTOPSIG(x) == 0x13)
#define WIFSTOPPED(x)   (_WSTATUS(x) == _WSTOPPED && WSTOPSIG(x) != 0x13)
#define WIFEXITED(x)    (_WSTATUS(x) == 0)
#define WIFSIGNALED(x)  (_WSTATUS(x) != _WSTOPPED && _WSTATUS(x) != 0)
#define WTERMSIG(x)     (_WSTATUS(x))
#define WCOREDUMP(x)    (_W_INT(x) & WCOREFLAG)

#define W_EXITCODE(ret, sig)    ((ret) << 8 | (sig))
#define W_STOPCODE(sig)         ((sig) << 8 | _WSTOPPED)


pid_t
     wait(int *stat_loc);

pid_t
     wait3(int *stat_loc, int options, struct rusage *rusage);

pid_t
     wait4(pid_t pid, int *stat_loc, int options, struct rusage *rusage);

pid_t
     waitpid(pid_t pid, int *stat_loc, int options);


WASI_C_END
