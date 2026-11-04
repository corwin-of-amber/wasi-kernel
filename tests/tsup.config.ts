import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {proc: 'src/core/bits/proc.ts', 'browser-process-exit': 'tests/browser-process-exit.ts'},
    outDir: '.test-build',
    format: ['cjs', 'esm'],
    outExtension: ({format}) => ({js: format === 'cjs' ? '.cjs' : '.mjs'}),
    platform: 'browser', target: 'es2022',
    external: ['@wasmer/sdk'],
    noExternal: [/^(?!@wasmer\/sdk(?:\/|$)).*/],
    clean: false, splitting: false,
});
