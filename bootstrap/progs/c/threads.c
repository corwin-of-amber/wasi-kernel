/* source: https://www.ibm.com/docs/en/zvm/7.3.0?topic=descriptions-pthread-create-create-thread */

#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void *thread(void *arg) {
  char *ret;
  printf("thread() entered with argument '%s'\n", (char *)arg);
  if ((ret = (char*) malloc(20)) == NULL) {
    perror("malloc() error");
    exit(2);
  }
  strcpy(ret, "This is a test");
  pthread_exit(ret);
}

int main() {
  pthread_t thid;
  void *ret;

  printf("main() entered\n");

  if (pthread_create(&thid, NULL, thread, "thread 1") != 0) {
    perror("pthread_create() error");
    exit(1);
  }

  if (pthread_join(thid, &ret) != 0) {
    perror("pthread_create() error");
    exit(3);
  }

  printf("thread exited with '%s'\n", (char *)ret);
}