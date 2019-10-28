var names = [
    "chdir",
    "getcwd",
    "longjmp",
    "signal",
    "raise",
    "pipe",
    "dup2",
    "setjmp",
    "execve",
    "getpwnam",
    "tcsetpgrp",
    "kill",
    "killpg",
    "fork",
    "getpid",
    "setpgid",
    "vfork",
    "strsignal",
    "wait3",
    "sigsuspend",
    "getuid",
    "geteuid",
    "getgid",
    "getegid",
    "umask",
    "getrlimit",
    "setrlimit",
    "sigaction",
    "sigfillset",
    "sigprocmask",
    "getppid"
]

const stubs = {};
for (let nm of names)
    stubs[nm] = function() { console.log(`stub for ${nm}`, [...arguments]); }


export default stubs
