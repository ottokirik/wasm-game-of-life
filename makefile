.PHONY: build, run

build:
	wasm-pack build 

run:
	cd web && bun run dev