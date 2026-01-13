#pragma once

#ifdef __wasix__
#include_next <setjmp.h>
#endif

WASI_C_START

typedef uint32_t setjmp_ret_val;

struct __wasik_jmp_buf { 
    uint32_t ret;
    setjmp_ret_val ret_val; 
};

#ifndef __wasix__
#define __jmp_buf __wasik_jmp_buf

typedef struct __jmp_buf jmp_buf[1];

int
    setjmp(jmp_buf env);

void
    longjmp(jmp_buf, int);

typedef struct __jmp_buf sigjmp_buf[1];
#endif

void
     siglongjmp(sigjmp_buf env, int val);

int
     sigsetjmp(sigjmp_buf env, int savemask);


WASI_C_END
