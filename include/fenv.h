#pragma once

/* is this even implemented in the WASM runtime? */
#define FE_TONEAREST        0x00000000
#define FE_UPWARD           0x00400000
#define FE_DOWNWARD         0x00800000
#define FE_TOWARDZERO       0x00C00000

#include_next <fenv.h>
