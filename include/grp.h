#pragma once

WASI_C_START


struct group {
	char *gr_name;
	char *gr_passwd;
	gid_t gr_gid;
	char **gr_mem;
};

struct group *
     getgrnam(const char *name);
struct group *
     getgrgid(gid_t gid);


WASI_C_END