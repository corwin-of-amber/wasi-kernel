var names = [
    "chdir",
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
    "getppid",
    "tcgetpgrp",
    "siginterrupt",
    "gethostname",
    "tzset",
    "flockfile",
    "funlockfile",
    "getpwuid",
    "getgrgid",
    "strmode",
    "acl_get_file",
    "acl_free",
    "acl_get_entry",
    "getprogname",
    "vasnprintf"
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