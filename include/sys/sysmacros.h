#pragma once

#ifndef major

#define major(x)        ((int32_t)(((u_int32_t)(x) >> 24) & 0xff))
#define minor(x)        ((int32_t)((x) & 0xffffff))
#define makedev(x, y)    ((dev_t)(((x) << 24) | (y)))

#endif