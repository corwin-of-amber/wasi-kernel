#pragma once

struct passwd {
    const char *pw_dir;
};

struct passwd *getpwnam(const char *);

