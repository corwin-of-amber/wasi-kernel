#include <stdio.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <errno.h>
#include <spawn.h>


int main(int argc, char *argv[]) {
    printf("%s started (main)\n", argv[0]);

    pid_t child_pid;
    char *const child_argv[] = {"subproc", "/", 0};
    char *const child_env[] = {"HOME=/home", 0};
    int rc = posix_spawn(&child_pid, "/bin/stdin", 0, 0, child_argv, child_env);

    printf("rc = %d\n", rc);
    if (rc != 0) perror("posix_spawn");
    else printf("child pid=%d\n", child_pid);

    int child_stat = 99;
    rc = waitpid(child_pid, &child_stat, 0);
    printf("waitpid rc=%d\n", rc);

    /* reading smt from stdin to see that it is still alive */
    char buf[20];
    size_t rd = fread(buf, 1, sizeof(buf), stdin);

    printf("fread %zu\n", rd);


    return 0;
}

