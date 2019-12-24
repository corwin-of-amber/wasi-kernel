#pragma once

// - helpers for fork
typedef void (^__control_block_t)(int);

void __control_fork(int v1, int v2, __control_block_t block);

void __control_setjmp(void **env, __control_block_t block);
