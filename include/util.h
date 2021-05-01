#pragma once

WASI_C_START

struct utmp;
void login(struct utmp *);
int login_tty(int);
int logout(const char *);
void logwtmp(const char *, const char *, const char *);
int opendev(char *, int, int, char **);
int openpty(int *, int *, char *, struct termios *, struct winsize *);
char *fparseln(FILE *, size_t *, size_t *, const char[3], int);
pid_t forkpty(int *, char *, struct termios *, struct winsize *);
int pidlock(const char *, int, pid_t *, const char *);
int ttylock(const char *, int, pid_t *);
int ttyunlock(const char *);
int ttyaction(char *tty, char *act, char *user);
struct iovec;
char *ttymsg(struct iovec *, int, const char *, int);

WASI_C_END