#pragma once

// - helpers for fork
typedef void (^__control_block_t)(int);
typedef void (*__control_block_cb)(__control_block_t, int);

void __control_invoke(__control_block_t block, int arg);
void __control_fork(int v1, int v2, __control_block_cb call,
                                    __control_block_t block);
