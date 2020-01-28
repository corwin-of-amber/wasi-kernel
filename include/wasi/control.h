#pragma once

WASI_C_START


// - helpers for fork, setjmp/longjmp
typedef void (^__control_block_t)(int);
typedef setjmp_ret_val (^__control_block_ret_t)(int);

void __control_fork(int v1, int v2, __control_block_t block);

void __control_setjmp(jmp_buf env, __control_block_t block);
setjmp_ret_val __control_setjmp_with_return
    (jmp_buf env, __control_block_ret_t block);

static inline void
__control_setjmp_set_return(jmp_buf env, setjmp_ret_val ret_val) {
    env[0].ret = 1; env[0].ret_val = ret_val;
}

#define __control_setjmp_return(env, ret_val) \
    __control_setjmp_set_return(env, ret_val); return

#define __control_setjmp_post(env, RTYPE) \
    if ((env)[0].ret) return (RTYPE)((env)[0].ret_val)


/* This is a must when using __block variables */
/* (wasi-libc provides a fallback implementation that aborts) */
static void _Block_object_dispose(const void *p, int val) 
    __attribute__ ((unused));
static void _Block_object_dispose(const void *p, int val) { } 


WASI_C_END