#include <stdio.h>
#include <unistd.h>

int open_and_read(const char *fn) {
    FILE *o = fopen(fn, "r");

    if (o == 0) { perror("open"); return 1; }

    char buf[10];
    size_t rd = fread(buf, 1, sizeof(buf), o);

    if (rd <= 0) { perror("read"); return 2; }
    printf("read %zu bytes\n", rd);

    return 0;
}

int open_and_write(const char *fn) {
    FILE *o = fopen(fn, "w");

    if (o == 0) { perror("open"); return 1; }

    char buf[] = "write buffer";
    size_t wr = fwrite(buf, 1, sizeof(buf), o);

    if (wr <= 0) { perror("write"); return 2; }
    printf("wrote %zu bytes\n", wr);

    fclose(o);

    return 0;
}

int main(int argc, char *argv[]) {
    char d[20];
    if (getcwd(d, sizeof(d)) == NULL) perror("getcwd");
    printf("cwd = %s\n", d);

    int ret1 = open_and_read("share/b.ml");

    int ret2 = open_and_read("share/a.ml");

    int ret3 = open_and_write("c.ml");

    int ret4 = open_and_read("c.ml");

    int rc = symlink("share/a.ml", "/home/d.ml");
    if (rc != 0) perror("symlink");

    int ret5 = open_and_read("d.ml");


    return ret1 + ret2 + ret3 + ret4 + ret5;
}