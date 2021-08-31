#pragma once

#ifdef __cplusplus
#define restrict
#define WASI_C_START extern "C" {
#define WASI_C_END }
#else
#define WASI_C_START
#define WASI_C_END
#endif


#define __NEED_sigset_t

#include <stdint.h>
#include <sys/types.h>
#include <bits/alltypes.h>


#define __WASI_EXTERNAL_NAME(name) \
    __attribute__((__import_module__("wasik_ext"), __import_name__(#name)))


typedef struct _IO_FILE FILE;

static const int F_DUPFD = 0;
#define AT_FDCWD (-100)


WASI_C_START

extern int __wasi_dupfd(int fd, int minfd, int cloexec) __WASI_EXTERNAL_NAME(dupfd);
extern int __wasi_tty_ioctl(int fd, int request, void *buf) __WASI_EXTERNAL_NAME(tty_ioctl);

extern void __wasi_trace(const char *) __WASI_EXTERNAL_NAME(trace);
extern void __wasi_sorry(void *) __WASI_EXTERNAL_NAME(sorry);

void *malloc(size_t);

/* stdlib.h */

extern int __wasi_progname_get(char **pbuf) __WASI_EXTERNAL_NAME(progname_get);

static inline const char *getprogname() {
     static char *buf = 0;
     if (!buf) __wasi_sorry(buf = (char*)malloc(__wasi_progname_get(&buf)));
     return buf;
}

char *
     realpath(const char *restrict file_name,
              char *restrict resolved_name);

int
     mkstemp(char *templat);

int
     mkstemps(char *templat, int suffixlen);

int
     mkostemp(char *templat, int oflags);

int
     mkostemps(char *templat, int suffixlen, int oflags);

/*
void abort(void);
*/

#define P_tmpdir "/tmp"

/* stdio.h */

void
     flockfile(FILE *file);
int
     ftrylockfile(FILE *file);
void
     funlockfile(FILE *file);

int
     fpurge(FILE *stream);

/*
char *
     ctermid(char *buf);
*/
char *
     ctermid_r(char *buf);

/* unistd.h */

int
     chdir(const char *path);
char *
     getcwd(char *buf, size_t size);

int
     fchdir(int fildes);

int
     chown(const char *path, uid_t owner, gid_t group);
int
     fchown(int fildes, uid_t owner, gid_t group);
int
     lchown(const char *path, uid_t owner, gid_t group);
int
     fchownat(int fd, const char *path, uid_t owner, gid_t group, int flag);

int
     chflags(const char *path, unsigned int flags);
int
     fchflags(int fd, unsigned int flags);
int
     lchflags(const char *path, unsigned int flags);

int
     chroot(const char *dirname);
 
int
     getgroups(int gidsetsize, gid_t grouplist[]);

int
     lockf(int fildes, int function, off_t size);

static inline off_t  // ???
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
     dup(int fildes);
int
     dup2(int fildes, int fildes2);
int
     dup3(int fildes, int fildes2, int flags);


pid_t
     getpgrp(void);
pid_t
     setpgrp(void);
pid_t
     tcgetpgrp(int fildes);
int
     tcsetpgrp(int fildes, pid_t pgid_id);
pid_t
     getpgid(pid_t pid);
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
     getsid(pid_t pid);     
int
     setegid(gid_t egid);
int
     seteuid(uid_t euid);
int
     setgid(gid_t gid);
int
     setuid(uid_t uid);     
int
     setreuid(uid_t ruid, uid_t euid);
int
     setregid(gid_t rgid, gid_t egid);
pid_t
     setsid(void);

pid_t
     fork(void);
pid_t
     vfork(void);     
int
     execv(const char *path, char *const argv[]);
int
     execve(const char *path, char *const argv[], char *const envp[]);
int
     execl(const char *path, const char *arg0, ... /*, (char *)0 */);
int
     execlp(const char *file, const char *arg0, ...);
int
     execvp(const char *file, char *const argv[]);

int
     getpagesize(void);

char *
     ttyname(int fd);
int
     ttyname_r(int fd, char *buf, size_t len);

extern int __wasi_login_get(char **pbuf) __WASI_EXTERNAL_NAME(login_get);

static inline char *getlogin() {
     static char *buf = 0;
     if (!buf) __wasi_sorry(buf = (char*)malloc(__wasi_login_get(&buf)));
     return buf;
}

unsigned
     alarm(unsigned seconds);

void
     sync(void);

int
     nice(int incr);

/* string.h */

void
     strmode(int mode, char *bp);

/* signal.h */

struct sigaction;
typedef struct sigaltstack stack_t;

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

void (*bsd_signal(int, void (*)(int)))(int);

struct sigaltstack { uint32_t ss_flags; void *ss_sp; uint32_t ss_size; };

int
     sigaltstack(const stack_t *restrict ss, stack_t *restrict oss);

#define SIGSTKSZ 1024

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
int
     lchmod(const char *path, mode_t flags);
          
#define st_atimespec st_atim
#define st_ctimespec st_ctim
#define st_mtimespec st_mtim

#define st_birthtimespec st_atim

int
     mkfifo(const char *path, mode_t mode);

/* dirent.h */

#define DT_SOCK 12
     
/* time.h */
     
void
     tzset(void);

/* sys/time.h */

struct timezone;

int
     gettimeofday(struct timeval *restrict tp, void *restrict tzp);
int
     settimeofday(const struct timeval *tp, const struct timezone *tzp);

int
     futimes(int fildes, const struct timeval times[2]);
int
     utimes(const char *path, const struct timeval times[2]);
int
     lutimes(const char *path, struct timeval times[2]);

int
     clock_gettime(clockid_t clock_id, struct timespec *tp);
int
     clock_settime(clockid_t clock_id, const struct timespec *tp);

/* fcntl.h */

#define F_RDLCK 0
#define F_WRLCK 1
#define F_UNLCK 2

#define F_SETLKW 0


WASI_C_END
