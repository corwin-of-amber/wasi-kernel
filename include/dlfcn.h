#pragma once

void*
     dlopen(const char* path, int mode);
void*
     dlsym(void* handle, const char* symbol);
const char*
     dlerror(void);
int
     dlclose(void* handle);
          
static const int RTLD_NOW = 1;
static const int RTLD_LAZY = 2;