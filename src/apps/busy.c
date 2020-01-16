#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>

#include <sys/types.h>
#include <dirent.h>
#include <errno.h>
#include <termios.h>


char buffer[2048];

extern void callback(void (*f)());

int terminal_init(FILE *stream) {
    struct termios oldtio, newtio;

    /* Turn echoing off and fail if we can't. */
    if (tcgetattr (fileno (stream), &oldtio) != 0)
        { }//return -1;
    newtio = oldtio;
    newtio.c_lflag &= ~ECHO;
    if (tcsetattr (fileno (stream), TCSAFLUSH, &newtio) != 0)
        return -1;

    return 0;
}

void cmdloop() {
    printf("In cmdloop\n");
    for (int i = 0; i < 2; i++) {
        fgets(buffer, sizeof(buffer), stdin);
        printf("buffer=%s\n", buffer);
    }
}

int cmd_ls(int argc, char *argv[]) {
    for (int i = 1; i < argc; i++) {
        char *arg = argv[i];

        DIR *d = opendir(arg);
        if (d == NULL) {
            fprintf(stderr, "%s: %s\n", arg, strerror(errno));
        }
        else {
            if (argc > 2) printf("%s:\n", arg);
            struct dirent *dp;
            while ((dp=readdir(d)) != NULL) {
                printf("  %s\n", dp->d_name);
            }
        }
    }

    return 0;
}

int cmd_touch(int argc, char *argv[]) {
    for (int i = 1; i < argc; i++) {
        FILE *f = fopen(argv[i], "w");
        if (f == NULL) {
            fprintf(stderr, "touch: %s: cannot open for write\n", argv[i]);
        }
        else {
            char buf[] = "touched";
            fwrite(buf, 1, sizeof(buf), f);
            fclose(f);
        }
        printf("touched %s.", argv[i]);
    }

    return 0;
}

int dispatch(int argc, char *argv[]) {
    char *cmd;
    for (int i = 0; i < 1; argc++, argv++, i++) {
        cmd = argv[0];
        if (strcmp(cmd, "ls") == 0) return cmd_ls(argc, argv);
        else if (strcmp(cmd, "touch") == 0) return cmd_touch(argc, argv);
    }
    fprintf(stderr, "no such applet: %s\n", cmd);
    return 1;
}

int main(int argc, char *argv[]) {

    setvbuf(stdin, 0, _IONBF, 0);  // unbuffered
    printf("isatty(0) = %d\n", isatty(0));

    printf("progname = '%s'\n", getprogname());

    terminal_init(stdin);

    char cwd[256];
    printf("getcwd() = %s\n", getcwd(cwd, sizeof(cwd)));

    printf("argc = %d\n", argc);
    for (int i = 0; i < argc; i++) {
        printf("argv[%d] = \"%s\"\n", i, argv[i]);
    }

    return dispatch(argc, argv);

    struct sigaction action;
    action.sa_sigaction = &cmdloop;
    sigaction(SIGINT, &action, 0);

    FILE *f = fopen("/home/a", "r");

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


    /* sigsuspend(0);*/
}

