#pragma once

typedef void *jmp_buf[1];

int
    setjmp(jmp_buf env);

void
    longjmp(jmp_buf, int);

typedef void *sigjmp_buf[1];

void
     siglongjmp(sigjmp_buf env, int val);

int
     sigsetjmp(sigjmp_buf env, int savemask);