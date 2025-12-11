#pragma once

WASI_C_START


struct group {
	char *gr_name;
	char *gr_passwd;
	gid_t gr_gid;
	char **gr_mem;
};

typedef void *uuid_t;


struct group *
     getgrent(void);

struct group *
     getgrnam(const char *name);

int
     getgrnam_r(const char *name, struct group *grp, char *buffer, size_t bufsize,
         struct group **result);

struct group *
     getgrgid(gid_t gid);

int
     getgrgid_r(gid_t gid, struct group *grp, char *buffer, size_t bufsize, struct group **result);

int
     getgruuid(uuid_t uuid);

int
     getgruuid_r(uuid_t uuid, struct group *grp, char *buffer, size_t bufsize, struct group **result);

int
     setgroupent(int stayopen);

void
     setgrent(void);

void
     endgrent(void);


WASI_C_END
