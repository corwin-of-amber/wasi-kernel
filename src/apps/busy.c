#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>

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

    struct sigaction action;
    action.sa_sigaction = &cmdloop;
    sigaction(SIGINT, &action, 0);

    sigsuspend(0);
}

