
WASI_CLANG = /opt/wasi-sdk/bin/clang

CFLAGS = -Iinclude -include include/etc.h

busy.wasm: src/apps/busy.c
	$(WASI_CLANG) $(CFLAGS) $^ -o $@ -Wl,-allow-undefined -Wl,--import-table

%.wat: %.wasm
	wasm2wat --dir=. $^ -o $@
