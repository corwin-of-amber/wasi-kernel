#pragma once

typedef void *jmp_buf;

int
    setjmp(jmp_buf env);

void
    longjmp(jmp_buf, int);

