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
    "sigsetmask",
    "getppid"
]

const stubs: {
    debug: (string) => void,
    [key: string]: (...args: any[]) => void
} = {
    debug: (message) => {}
};
for (let nm of names) {
    stubs[nm] = function() {
        stubs.debug(`stub for ${nm} [${[...arguments]}]`);
    }
}

export default stubs
