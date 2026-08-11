#pragma once

#define __wasik_override_tcgetattr

#ifdef __wasix__
#include_next <termios.h>
#endif

WASI_C_START

#ifndef __wasix__

#include <features.h>

#define __NEED_pid_t

#include <bits/alltypes.h>

typedef unsigned char cc_t;
typedef unsigned int speed_t;
typedef unsigned int tcflag_t;

#define NCCS 32

#include <bits/termios.h>

speed_t cfgetospeed (const struct termios *);
speed_t cfgetispeed (const struct termios *);
int cfsetospeed (struct termios *, speed_t);
int cfsetispeed (struct termios *, speed_t);

int tcgetattr (int, struct termios *);
int tcsetattr (int, int, const struct termios *);

int tcsendbreak (int, int);
int tcdrain (int);
int tcflush (int, int);
int tcflow (int, int);

pid_t tcgetsid (int);

#if defined(_GNU_SOURCE) || defined(_BSD_SOURCE)
void cfmakeraw(struct termios *);
int cfsetspeed(struct termios *, speed_t);
#endif

#endif

__attribute__((unused))
static int __wasik_tcgetattr (int fd, struct termios *t) {
    int res = tcgetattr(fd, t);
    /* wasix-libc does not implement those */
    t->c_cc[VINTR] = '\x03';
    t->c_cc[VQUIT] = '\x1c';
    t->c_cc[VERASE] = '\x7f';
    t->c_cc[VKILL] = '\x15';
    t->c_cc[VEOF] = '\x04';
    t->c_cc[VSTOP] = '\x13';
    t->c_cc[VSUSP] = '\x1a';
    t->c_cc[VREPRINT] = '\x12';
    t->c_cc[VDISCARD] = '\x0f';
    t->c_cc[VWERASE] = '\x17';
    t->c_cc[VLNEXT] = '\x16';
    return res;
}

#ifdef __wasik_override_tcgetattr
#define tcgetattr(X,Y) __wasik_tcgetattr(X,Y)
#endif

WASI_C_END
