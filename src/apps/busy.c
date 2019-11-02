#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>

#include <sys/types.h>
#include <dirent.h>
#include <errno.h>

char buffer[2048];

extern void callback(void (*f)());

void cmdloop() {
    printf("In cmdloop\n");
    for (int i = 0; i < 2; i++) {
        fgets(buffer, sizeof(buffer), stdin);
        printf("buffer=%s\n", buffer);
    }
}

int main(int argc, char *argv[]) {

    setvbuf(stdin, 0, _IONBF, 0);  // unbuffered
    printf("isatty(0) = %d\n", isatty(0));

    char cwd[256];
    printf("getcwd() = %s\n", getcwd(cwd, sizeof(cwd)));

    struct sigaction action;
    action.sa_sigaction = &cmdloop;
    sigaction(SIGINT, &action, 0);

    FILE *f = fopen("/a", "r");

    printf("%p\n", f);

    int rc = fread(buffer, 1, 1024, f);
    printf("read count = %d\n", rc);

    buffer[rc] = 0;
    printf("%s\n", buffer);

    DIR *d = opendir("/");

    printf("%p\n", d);
    if (d == 0) printf("%s\n", strerror(errno));

    if (d) {
        struct dirent *dp;
        while ((dp=readdir(d)) != NULL) {
            printf("file_name: \"%s\"\n", dp->d_name);
        }
    }


    sigsuspend(0);
}

