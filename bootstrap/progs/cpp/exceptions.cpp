#include <iostream>

int main(int argc, char *argv[]) {
    std::cout << "[exceptions] started" << std::endl;

    //try {
        std::cout << "throw..." << std::endl;
        throw std::logic_error("red-letter");
    /*
    catch (std::exception& e) {
        std::cout << "...catch " << e.what() << std::endl;
    }*/

    return 0;
}

extern "C" __attribute__((export_name("std_exception_what")))
const char* std_exception_what(void* exception_ptr) {
    // Cast the raw payload pointer back to the expected C++ type.
    // Warning: Only call this if you are certain the exception is a std::logic_error 
    // or inherits from it (like std::invalid_argument).
    auto* err = static_cast<std::logic_error*>(exception_ptr);
    return err->what();
}