/** @oops in case this file is compiled with clang++ */
WASI_C_START

/* intentionally avoiding system #includes because these may be
 * overridden by `-I`, e.g. in gnulib. */
extern char *getenv(const char*);
extern char *strdup(const char *);

extern char *__wasilibc_cwd;

/**
 * Startup function; initializes cwd from environ PWD if it exists.
 * Called at initialization, must be called after `__wasilibc_initialize_environ_eagerly`
 * (which is `((constructor(50)))`).
 */
 __attribute__((constructor(100)))
int __attribute__((weak)) wasik_startup() {
     char *cwd = getenv("PWD");

     if (cwd) chdir(cwd); /** @todo why does this not work?: `__wasilibc_cwd = strdup(cwd);` */
     /** @oops strictly speaking, need to set `__wasilibc_cwd_mallocd = 1` but it's private */
     return 0;
}

char **__attribute__((export_name("wasik_environ"),weak)) __wasik_environ() {
     extern char **__wasilibc_environ;
     return __wasilibc_environ;
}

WASI_C_END
