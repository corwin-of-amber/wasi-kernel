#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <spawn.h>
#include <sys/wait.h>

extern char **environ;

int main() {
    pid_t pid;
    int in_pipe[2];  // Parent writes to in_pipe[1], child reads from in_pipe[0]
    int out_pipe[2]; // Child writes to out_pipe[1], parent reads from out_pipe[0]
    posix_spawn_file_actions_t actions;

    // 1. Create the pipes
    if (pipe(in_pipe) != 0 || pipe(out_pipe) != 0) {
        perror("pipe failed");
        return EXIT_FAILURE;
    }

    // 2. Initialize the file actions structure
    posix_spawn_file_actions_init(&actions);

    // --- Configure Child's STDIN ---
    // Child doesn't need the write-end of the input pipe
    posix_spawn_file_actions_addclose(&actions, in_pipe[1]);
    // Duplicate the read-end of the pipe to STDIN (fd 0)
    posix_spawn_file_actions_adddup2(&actions, in_pipe[0], STDIN_FILENO);
    // Close the original read-end file descriptor
    posix_spawn_file_actions_addclose(&actions, in_pipe[0]);

    // --- Configure Child's STDOUT ---
    // Child doesn't need the read-end of the output pipe
    posix_spawn_file_actions_addclose(&actions, out_pipe[0]);
    // Duplicate the write-end of the pipe to STDOUT (fd 1)
    posix_spawn_file_actions_adddup2(&actions, out_pipe[1], STDOUT_FILENO);
    // Close the original write-end file descriptor
    posix_spawn_file_actions_addclose(&actions, out_pipe[1]);

    // 3. Command to run: 'tr a-z A-Z' (converts lowercase to uppercase)
    char *argv[] = {"/usr/bin/stdin", "a-z", "A-Z", NULL};

    // 4. Spawn the child process
    if (posix_spawnp(&pid, argv[0], &actions, NULL, argv, environ) != 0) {
        perror("posix_spawnp failed");
        return EXIT_FAILURE;
    }

    // 5. Parent-side pipe cleanup
    close(in_pipe[0]);  // Parent doesn't read from the input pipe
    close(out_pipe[1]); // Parent doesn't write to the output pipe

    // 6. Write data to the child's stdin
    const char *msg = "hello posix_spawn world!\n";
    write(in_pipe[1], msg, strlen(msg));
    
    // Crucial: Close the write pipe to send EOF, telling 'tr' to stop waiting for data
    close(in_pipe[1]);

    // 7. Read the response from the child's stdout
    while (1) {
        char buffer[128];
        ssize_t bytes_read = read(out_pipe[0], buffer, sizeof(buffer) - 1);
        if (bytes_read > 0) {
            buffer[bytes_read] = '\0'; // Null-terminate the string
            printf("Parent received: %s\n", buffer);
        }
        else break;
    }
    close(out_pipe[0]);

    // 8. Wait for the child process to exit and clean up
    int status;
    waitpid(pid, &status, 0);
    printf("Child exit detected.\n");
    posix_spawn_file_actions_destroy(&actions);

    return EXIT_SUCCESS;
}