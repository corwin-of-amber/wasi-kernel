#pragma once

struct group {
    int gr_gid;
    const char *gr_name;
};

struct group *
     getgrnam(const char *name);
struct group *
     getgrgid(gid_t gid);
