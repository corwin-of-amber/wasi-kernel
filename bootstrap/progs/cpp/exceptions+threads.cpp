#include <iostream>


extern "C" __attribute__((__import_module__("wasix_32v1"), __import_name__("proc_exit")))
void proc_exit(int code);


int main(int argc, char *argv[]) {
    std::cout << "[exceptions] started" << std::endl;

    try {
        std::cout << "throw..." << std::endl;
        //throw std::logic_error("red-letter");
    }
    catch (std::exception& e) {
        // notice: catching does not quite work with latest wasi-kernel (need to upgrade wasmer)
        std::cout << "...catch " << e.what() << std::endl;
    }

    proc_exit(0);

    return 0;
}


extern "C" __attribute__((__import_module__("wasix_32v1"), __import_name__("proc_exit2")))
void proc_exit2(int code) { proc_exit(code); }

//extern "C" void __wasi_proc_exit2(__wasi_exitcode_t code) { proc_exit(code); }

char __wasm_lpad_context[128];