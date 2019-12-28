#pragma once

#include <stdint.h>
#include <sys/types.h>
#include <signal.h>

typedef struct _IO_FILE FILE;


static const int NSIG = 32;
static void (* const SIG_DFL)(int) = 0;
static void (* const SIG_IGN)(int) = 0;
static void (* const SIG_ERR)(int) = 0;

static const int F_DUPFD = 0;
static const int AT_FDCWD = 0;

extern int __wasi_dupfd(int fd, int minfd, int cloexec);


/* stdlib.h */

const char *getprogname();

int
     mkstemp(char *templat);

int
     mkstemps(char *templat, int suffixlen);

int
     mkostemp(char *templat, int oflags);

int
     mkostemps(char *templat, int suffixlen, int oflags);

void abort(void);

/* stdio.h */

int
     fpurge(FILE *stream);
     
/* unistd.h */

int
     chdir(const char *path);
char *
     getcwd(char *buf, size_t size);

int
     fchdir(int fildes);
     
static inline off_t
     __wasilibc_tell(int fd) {
          return 0;
     }

typedef void (*sig_t) (int);
sig_t
    signal(int sig, sig_t func);
int
    raise(int sig);
int
     kill(pid_t pid, int sig);
int
     killpg(pid_t pgrp, int sig);
     
int
     pipe(int fildes[2]);
int
     dup2(int fildes, int fildes2);


pid_t
     getpgrp(void);
pid_t
     setpgrp(void);
pid_t
     tcgetpgrp(int fildes);
int
     tcsetpgrp(int fildes, pid_t pgid_id);
int
     setpgid(pid_t pid, pid_t pgid);
int
     issetugid(void);
pid_t
     getpid(void);
pid_t
     getppid(void);
uid_t
     getuid(void);
gid_t
     getgid(void);
uid_t
     geteuid(void);
gid_t
     getegid(void);

pid_t
     fork(void);
pid_t
     vfork(void);     
int
     execve(const char *path, char *const argv[], char *const envp[]);
int
     execlp(const char *file, const char *arg0, ...);
int
     execvp(const char *file, char *const argv[]);

/* #include "wasi/control.h" */

/* string.h */

void
     strmode(int mode, char *bp);

/* signal.h */

int
     sigaction(int sig, const struct sigaction *restrict act,
                        struct sigaction *restrict oact);
int
     sigsuspend(const sigset_t *sigmask);

int
     sigprocmask(int how, const sigset_t *restrict set,
                          sigset_t *restrict oset);     
int
     sigsetmask(int mask);

#define __sigbits(signo)	(1 << ((signo) - 1))

#define	sigaddset(set, signo)	(*(set) |= __sigbits(signo), 0)
#define	sigdelset(set, signo)	(*(set) &= ~__sigbits(signo), 0)
#define	sigismember(set, signo)	((*(set) & __sigbits(signo)) != 0)
#define	sigemptyset(set)    	(*(set) = 0, 0)
#define	sigfillset(set)		(*(set) = ~(sigset_t)0, 0)

int
     siginterrupt(int sig, int flag);

/* sys/stat.h */

typedef unsigned int mode_t;

mode_t
     umask(mode_t cmask);

int
     chmod(const char *path, mode_t mode);
int
     fchmod(int fildes, mode_t mode);
int
     fchmodat(int fd, const char *path, mode_t mode, int flag);
     
#define st_atimespec st_atim
#define st_ctimespec st_ctim
#define st_mtimespec st_mtim

#define st_birthtimespec st_atim
     
/* sys/resource.h */

typedef unsigned int rlim_t;
struct rlimit { rlim_t rlim_max; rlim_t rlim_cur; };
static const int RLIM_INFINITY = 0;

int
     getrlimit(int resource, struct rlimit *rlp);

int
     setrlimit(int resource, const struct rlimit *rlp);

/* dirent.h */

#define DT_SOCK 12
     
/* time.h */
     
void
     tzset(void);

/* sys/time.h */
int
     futimes(int fildes, const struct timeval times[2]);

int
     utimes(const char *path, const struct timeval times[2]);
