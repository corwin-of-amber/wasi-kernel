#pragma once

#include <sys/stat.h>
#include <signal.h>

typedef void *posix_spawnattr_t;

#ifndef __wasi__
#define restrict
#endif

WASI_C_START


int
     posix_spawnattr_init(posix_spawnattr_t *attr);
int
     posix_spawnattr_destroy(posix_spawnattr_t *attr);
int
     posix_spawnattr_setflags(posix_spawnattr_t *attr, short flags);
int
     posix_spawnattr_getflags(const posix_spawnattr_t *restrict attr,
         short *restrict flags);
int
     posix_spawnattr_setsigmask(posix_spawnattr_t *restrict attr,
         const sigset_t *restrict sigmask);
int
     posix_spawnattr_getsigmask(const posix_spawnattr_t *restrict attr,
         sigset_t *restrict sigmask);

int
     posix_spawnattr_setsigdefault(posix_spawnattr_t *restrict attr,
         const sigset_t *restrict sigdefault);
int
     posix_spawnattr_getsigdefault(const posix_spawnattr_t *restrict attr,
         sigset_t *restrict sigdefault);

int
     posix_spawnattr_setpgroup(posix_spawnattr_t *attr, pid_t pgroup);
int
     posix_spawnattr_getpgroup(const posix_spawnattr_t *restrict attr, pid_t *restrict pgroup);

typedef void *posix_spawn_file_actions_t;

int
     posix_spawn_file_actions_init(posix_spawn_file_actions_t *file_actions);
int
     posix_spawn_file_actions_destroy(posix_spawn_file_actions_t *file_actions);
int
     posix_spawn_file_actions_addclose(posix_spawn_file_actions_t *file_actions,
         int filedes);

int
     posix_spawn_file_actions_addopen(posix_spawn_file_actions_t *restrict file_actions,
         int filedes, const char *restrict path, int oflag,
         mode_t mode);
int
     posix_spawn_file_actions_adddup2(posix_spawn_file_actions_t *file_actions,
         int filedes, int newfiledes);
int
     posix_spawn_file_actions_addinherit_np(posix_spawn_file_actions_t *file_actions,
         int filedes);
int
     posix_spawn_file_actions_addchdir_np(posix_spawn_file_actions_t *file_actions,
         const char *restrict path);
int
     posix_spawn_file_actions_addfchdir_np(posix_spawn_file_actions_t *file_actions,
         int filedes);

int
     posix_spawn(pid_t *restrict pid, const char *restrict path,
         const posix_spawn_file_actions_t *file_actions,
         const posix_spawnattr_t *restrict attrp, char *const argv[restrict],
         char *const envp[restrict]);

int
     posix_spawnp(pid_t *restrict pid, const char *restrict file,
         const posix_spawn_file_actions_t *file_actions,
         const posix_spawnattr_t *restrict attrp, char *const argv[restrict],
         char *const envp[restrict]);

/* POSIX_SPAWN_* constants, based on Darwin */

/*
 * Possible bit values which may be OR'ed together and provided as the second
 * parameter to posix_spawnattr_setflags() or implicit returned in the value of
 * the second parameter to posix_spawnattr_getflags().
 */
#define POSIX_SPAWN_RESETIDS            0x0001  /* [SPN] R[UG]ID not E[UG]ID */
#define POSIX_SPAWN_SETPGROUP           0x0002  /* [SPN] set non-parent PGID */
#define POSIX_SPAWN_SETSIGDEF           0x0004  /* [SPN] reset sigset default */
#define POSIX_SPAWN_SETSIGMASK          0x0008  /* [SPN] set signal mask */

/*
 * Possible values to be set for the process control actions on resource starvation.
 * POSIX_SPAWN_PCONTROL_THROTTLE indicates that the process is to be throttled on starvation.
 * POSIX_SPAWN_PCONTROL_SUSPEND indicates that the process is to be suspended on starvation.
 * POSIX_SPAWN_PCONTROL_KILL indicates that the process is to be terminated  on starvation.
 */
#define POSIX_SPAWN_PCONTROL_NONE       0x0000
#define POSIX_SPAWN_PCONTROL_THROTTLE   0x0001
#define POSIX_SPAWN_PCONTROL_SUSPEND    0x0002
#define POSIX_SPAWN_PCONTROL_KILL       0x0003


WASI_C_END
