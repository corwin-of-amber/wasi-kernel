#!/bin/sh -e
parcel build --target node -d lib/kernel src/kernel/index.ts
tsc --emitDeclarationOnly --outDir lib
