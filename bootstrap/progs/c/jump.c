// source: https://wasix.org/docs/language-guide/c/tutorials/longjmp

#include <stdio.h>
#include <setjmp.h>
 
jmp_buf bufferA, bufferB;
 
__attribute__((noinline)) void routineB(); // forward declaration
 
__attribute__((noinline)) void routineA()
{
    int r = 1;
 
    printf("(A1)\n");
 
    r = setjmp(bufferA); // save the current context in bufferA
    if (r == 0)
        routineB(); // call routineB() and pass control to it
 
    printf("(A2) r=%d\n", r); // r will be 10001
 
    r = setjmp(bufferA);
    if (r == 0)
        longjmp(bufferB, 20001); // pass control to bufferB and return 20001
 
    printf("(A3) r=%d\n", r); // r will be 10002
 
    r = setjmp(bufferA);
    if (r == 0)
        longjmp(bufferB, 20002); // pass control to bufferB and return 20002
 
    printf("(A4) r=%d\n", r); // r will be 10003
}
 
__attribute__((noinline)) void routineB()
{
    int r;
 
    printf("(B1)\n");
 
    r = setjmp(bufferB); // save the current context in bufferB
    if (r == 0)
        longjmp(bufferA, 10001); // pass control to bufferA and return 10001
 
    printf("(B2) r=%d\n", r); // r will be 20001
 
    r = setjmp(bufferB);
    if (r == 0)
        longjmp(bufferA, 10002); // pass control to bufferA and return 10002
 
    printf("(B3) r=%d\n", r); // r will be 20002
 
    r = setjmp(bufferB);
    if (r == 0)
        longjmp(bufferA, 10003); // pass control to bufferA and return 10003
}
 
int main(int argc, char **argv)
{
    routineA(); // call routineA() and pass control to it
    return 0;
}