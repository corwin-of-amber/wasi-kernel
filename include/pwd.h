#pragma once

struct passwd {
    int pw_uid;
    const char *pw_name;
    const char *pw_dir;
};

struct passwd *getpwnam(const char *);

struct passwd *
     getpwent(void);

struct passwd *
     getpwuid(uid_t uid);
