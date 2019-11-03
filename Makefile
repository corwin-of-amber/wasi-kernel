
WASI_CLANG = wasicc

busy.wasm: src/apps/busy.c include/wasi/trap64.c
	$(WASI_CLANG) $^ -o $@ -Wl,-allow-undefined -Wl,--import-table

busy32.wasm:
	node scripts/lower64.js

%.wat: %.wasm
	wasm2wat --dir=. $^ -o $@
