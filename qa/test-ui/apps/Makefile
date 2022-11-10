WASI_SDK = /opt/wasi-sdk
INC = -I../../../include -include ../../../include/etc.h
LIB = ../../../include/lib.c ../../../include/bits/startup.c
LDFLAGS = -Wl,-allow-undefined -Wl,--import-table

busy.wasm: busy.c
	$(WASI_SDK)/bin/clang busy.c $(INC) $(LIB) $(LDFLAGS) -o busy.wasm

%.wat: %.wasm
	wasm2wat --dir=. $^ -o $@
