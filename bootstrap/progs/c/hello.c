#include <stdio.h>
#include <unistd.h>
#include <dirent.h>

#include <sys/stat.h>
#include <fcntl.h>
#include <errno.h>

/*
 * compile with:
 * clang hello.c --sysroot=../packages/wasix-libc/sysroot -pthread -Wl,-allow-undefined
 * 
 * `-pthread` / shared memory is needed for `fopen` to work;
 * path-related functions in wasix-libc use tls.
 */

int does_not_exist();

int main(int argc, char *argv[]) {

    printf("start %s\n", argv[0]);

    FILE *o = fopen("peep", "w");
    if (o == NULL) {
        perror("peep (create)");
    }
    else {
        fprintf(o, "<---o--->\n");
        fclose(o);
    }

	struct timespec timebuf[2];
    int rc = utimensat(AT_FDCWD, "/usr/bin/ls", NULL, 0);

    
    printf("%d %d %d\n", rc, errno, ENOENT);
    if (rc != 0)
        perror("/usr/bin/ls");

    int fd = open("peep", O_RDWR /* | O_CREAT */, 0666);

    printf("%d %d\n", fd, errno);
    if (fd < 0) {
        perror("peep (open)");
    }
    else {
        char buf[80];
        size_t rd = read(fd, buf, 79);
        if (rd < 0) perror("peep (read)");
        else { buf[rd] = 0; printf("%zu %s\n", rd, buf); }
    }

#ifndef BARE
    printf("This is a cliche  (%d)\n", 
        does_not_exist());
#endif

    return 0;
}
