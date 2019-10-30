var names = [
    "chdir",
    "getcwd",
    "longjmp",
    "signal",
    "raise",
    "pipe",
    "dup",
    "dup2",
    "setjmp",
    "execve",
    "execvp",
    "getpwnam",
    "tcsetpgrp",
    "kill",
    "killpg",
    "fork",
    "getpid",
    "setpgid",
    "vfork",
    "strsignal",
    "wait",
    "wait3",
    "waitpid",
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
    stubs[nm] = function() { stubs.debug(`stub for ${nm} [${[...arguments]}]`); }

stubs.debug = () => {};

export default stubs
