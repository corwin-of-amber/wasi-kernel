
busy.wasm: apps/busy.c
	npx wasi-kit clang $< -o $@

%.wat: %.wasm
	wasm2wat --dir=. $^ -o $@
