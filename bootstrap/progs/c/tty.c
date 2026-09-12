#include <stdio.h>
#include <unistd.h>
#include <sys/ioctl.h>


int main(int argc, char *argv[]) {

    printf("[%s] started\n", argv[0]);

    struct winsize win;
    int rc = ioctl(STDIN_FILENO, TIOCGWINSZ, &win);
    printf("(rc=%d) terminal size %d %d\n", rc, win.ws_row, win.ws_col);

    printf("[%s] ended\n", argv[0]);

    return 0;
}