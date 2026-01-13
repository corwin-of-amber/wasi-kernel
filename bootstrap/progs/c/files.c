#include <stdio.h>

int open_and_read(const char *fn) {
    FILE *o = fopen(fn, "r");

    if (o == 0) { perror("open"); return 1; }

    char buf[10];
    size_t rd = fread(buf, 1, sizeof(buf), o);

    if (rd <= 0) { perror("read"); return 2; }
    printf("read %zu bytes\n", rd);

    return 0;
}

int main(int argc, char *argv[]) {
    int ret1 = open_and_read("share/b.ml");

    int ret2 = open_and_read("share/a.ml");

    return ret1 + ret2;
}