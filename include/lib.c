/* try to include as little as possible (see `bits/startup.c`) */
#include <sys/param.h>
#include <__struct_stat.h>


/** @oops in case this file is compiled with clang++ */
WASI_C_START


// not strictly related to startup, but too small for its own file :P
char *getwd(char *buf) { return getcwd(buf, MAXPATHLEN); }

#undef stat
#undef lstat
int
     stat(const char *restrict path, struct stat *restrict buf);
int
     lstat(const char *restrict path, struct stat *restrict buf);

int
     __wasik_stat(const char *restrict path, struct stat *restrict buf)
{
     int rc = stat(path, buf);
     /** @todo everything is executable now!! need a more subtle hack */
     if (rc == 0) buf->st_mode |= 0777;
     return rc;
}

int
     __wasik_lstat(const char *restrict path, struct stat *restrict buf)
{
     int rc = lstat(path, buf);
     /** @todo everything is executable now!! need a more subtle hack */
     if (rc == 0) buf->st_mode |= 0777;
     return rc;
}


WASI_C_END