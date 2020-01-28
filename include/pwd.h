#pragma once

WASI_C_START


#include <sys/types.h>

struct passwd {
     char    *pw_name;       /* user name */
     char    *pw_passwd;     /* encrypted password */
     uid_t   pw_uid;         /* user uid */
     gid_t   pw_gid;         /* user gid */
     time_t  pw_change;      /* password change time */
     char    *pw_class;      /* user access class */
     char    *pw_gecos;      /* Honeywell login info */
     char    *pw_dir;        /* home directory */
     char    *pw_shell;      /* default shell */
     time_t  pw_expire;      /* account expiration */
     int     pw_fields;      /* internal: fields filled in */
};

struct passwd *getpwnam(const char *);

int
     getpwnam_r(const char *name, struct passwd *pwd, char *buffer,
         size_t bufsize, struct passwd **result);

struct passwd *
     getpwent(void);

struct passwd *
     getpwuid(uid_t uid);

int
     getpwuid_r(uid_t uid, struct passwd *pwd, char *buffer, size_t bufsize,
         struct passwd **result);

void
     setpwent();

void
     endpwent();


WASI_C_END
