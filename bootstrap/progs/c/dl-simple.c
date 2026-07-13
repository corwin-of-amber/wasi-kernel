#include <stdio.h>
#include <dlfcn.h>


int main(int argc, char *argv[]) {
    printf("[dl-simple] starting main\n");

    void *sym = dlsym(RTLD_DEFAULT, "simple_func");
    printf("sym=%p\n", sym);

    if (sym == 0) {
        printf("error: %s\n", dlerror());
    }
    else {
        printf("calling sym\n");
        printf(" %d\n", ((int (*)())sym)());
    }

    sym = dlsym(RTLD_DEFAULT, "simple_array");
    printf("sym=%p\n", sym);
    if (sym == 0) {
        printf("error: %s\n", dlerror());
    }
    else {
        printf("reading from memory at sym\n");
        for (int i = 0; i < 3; i++)
            printf(" [%d] %d\n", i, ((int*)sym)[i]);
    }

    dlsym(RTLD_DEFAULT, "does_not_exist");
    printf("error (expected): %s\n", dlerror());

    return 0;
}


extern int simple_func() { printf(">> in simple_func\n"); return 42; }

extern int simple_array[];
int simple_array[] = {9, 7, 2};

#ifdef __wasi__

// polyfill
extern __attribute__((__import_module__("wasix_32v1"), __import_name__("proc_exit")))
void proc_exit(int code);
extern void __wasi_proc_exit2(__wasi_exitcode_t code) { proc_exit(code); }

#endif