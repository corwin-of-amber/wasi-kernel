INC = -I../../include -include ../../include/etc.h
LDFLAGS = -Wl,-allow-undefined -Wl,--import-table

busy.wasm: busy.c
	/opt/wasi-sdk/bin/clang busy.c $(INC) $(LDFLAGS) -o busy.wasm

%.wat: %.wasm
	wasm2wat --dir=. $^ -o $@
