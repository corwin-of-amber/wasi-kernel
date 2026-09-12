/* source: https://www.ibm.com/docs/en/zvm/7.3.0?topic=descriptions-pthread-create-create-thread */

#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>

void *thread(void *arg) {
  char *ret;
  printf("thread() entered with arg='%s' %p\n", (char *)arg, pthread_self());
  if ((ret = (char*) malloc(20)) == NULL) {
    perror("malloc() error");
    exit(2);
  }
  usleep(500000);
  FILE *f = fopen("a.lean", "r");
  printf("opened %p\n", f);
  strcpy(ret, "This is a test");
  int fd = open("thread-out", O_CREAT | O_WRONLY);
  printf("opened 'thread-out' (write) %d\n", fd);
  close(fd);
  pthread_exit(ret);
}

int main() {
  pthread_t thid;
  void *ret;

  printf("[threads] main() entered\n");

  int fd = open("main-out", O_CREAT | O_WRONLY);
  printf("opened 'main-out' (write) %d\n", fd);

  if (pthread_create(&thid, NULL, thread, "thread 1") != 0) {
    perror("pthread_create() error");
    exit(1);
  }

  usleep(250000);
  printf("main thread keeps running \n");

  if (pthread_join(thid, &ret) != 0) {
    perror("pthread_join() error");
    exit(3);
  }

  printf("thread exited with ret='%s'\n", (char *)ret);
}