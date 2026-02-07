#include <stdio.h>
#include <unistd.h>

/*
 * compile with:
 * clang hello.c --sysroot=../packages/wasix-libc/sysroot -pthread -Wl,-allow-undefined
 * 
 * `-pthread` / shared memory is needed for `fopen` to work;
 * path-related functions in wasix-libc use tls.
 */


int main(int argc, char *argv[]) {

    printf("%s started\n", argv[0]);

    while (!feof(stdin)) {
        char buf[20];
        size_t rd = fread(buf, 1, sizeof(buf), stdin);

        printf("fread %zu\n", rd);
    }

    printf("%s ended\n", argv[0]);

    return 0;
}