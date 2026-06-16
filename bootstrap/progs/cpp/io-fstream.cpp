#include <iostream>
#include <fstream>

int main(int argc, char *argv[]) {
    std::cout << "start io-fstream" << std::endl;

    std::ofstream outf("a.txt");

    std::cout << "opened file " << outf.good() << std::endl;

    return 0;
}
