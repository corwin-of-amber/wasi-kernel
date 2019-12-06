#pragma once

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

struct passwd *
     getpwent(void);

struct passwd *
     getpwuid(uid_t uid);
