/* Exercise the WASIX exit imports through the real SDK lifecycle. */
#include <stdio.h>
#include <stdlib.h>
__attribute__((import_module("wasix_32v1"), import_name("proc_exit")))
extern void wasix_proc_exit(int code);
__attribute__((import_module("wasix_32v1"), import_name("proc_exit2")))
extern void wasix_proc_exit2(int code);
int main(int argc, char **argv) {
    puts("guest started");
    fflush(stdout);
    int code = argc > 1 ? atoi(argv[1]) : 0;
    if (argc > 2 && argv[2][0] == '2') wasix_proc_exit2(code);
    else wasix_proc_exit(code);
    return 99;
}
