import { defineConfig } from 'tsup';

export default defineConfig([{
    entry: ['src/index.ts', 'src/services/index.ts'],
    format: ['cjs', 'esm'],
    
    //dts: true,
    experimentalDts: true,

    clean: true,
    splitting: true,
    external: ['@wasmer/sdk'],

    // hook to set the name of the shared chunk(s)
    esbuildOptions(options, context) {
        options.chunkNames = 'wasik-[hash]'; 
    },
},
{
    entry: {
        worker: 'src/worker.webpack.js',
    },
    format: ['esm'], 
    
    splitting: false,
    clean: false,
    
    noExternal: [/.*/],   // bundle everything
}]);