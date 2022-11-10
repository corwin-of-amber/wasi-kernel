const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');
const TerserPlugin = require('terser-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const base = (argv) => ({
    mode: argv.mode || 'development',
    devtool: argv.mode !== 'production' ? "source-map" : undefined,
    stats: {
      hash: false, version: false, modules: false  // reduce verbosity
    },
    optimization: {
      minimizer: [
        new TerserPlugin({  /* this is a hack because wasmer-js checks the class name */
          terserOptions: { keep_fnames: /^MemFS$/ }
        })  
      ]
    },
  });
const ts = {
  test: /\.tsx?$/,
  use: {
    loader: 'ts-loader', 
    options: {allowTsInNodeModules: true} // useful for development
  },
};
const wasm = {
  test: /\.wasm$/,
  type: 'asset/resource'
};
const modules = (modnames) =>
  Object.fromEntries(modnames.map(m => [m, `module ${m}`]));

module.exports = (env, argv) => [{
  name: 'worker',
  entry: './src/kernel/worker.ts',
  target: 'webworker',
  output: {
    filename: 'worker.js',
    path: `${__dirname}/dist`
  },
  ...base(argv),
  module: {rules: [ts, wasm]},
  resolve: {
    extensions: [ '.ts', '.js' ],
    fallback: {
        url: false, crypto: false, tty: false, worker_threads: false,
        path: require.resolve("path-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/")
    }
  },
  externals: {
    fs: 'commonjs2 fs'
  },
  plugins: [
    new webpack.ProvidePlugin({Buffer: ['buffer', 'Buffer'],
                               process: 'process/browser' }),
    //new BundleAnalyzerPlugin()
  ]
},
{
  name: 'esm',
  entry: './src/kernel/index.ts',
  ...base(argv),
  experiments: {
    outputModule: true
  },
  output: {
    filename: 'index.js',
    path: `${__dirname}/lib/kernel`,
    library: {type: 'module'}
  },
  module: {rules: [ts, wasm]},
  resolve: {
    extensions: [ '.ts', '.js' ],
  },
  externalsType: 'module',
  externals: {
    ...modules(['fs', 'path', 'worker_threads']),
    '@wasmer/wasi/lib': 'module @wasmer/wasi'
  }
},
{
  name: 'cjs',
  target: 'node',
  entry: './src/kernel/index.ts',
  ...base(argv),
  output: {
    filename: 'index.cjs.js',
    path: `${__dirname}/lib/kernel`,
    library: {type: 'commonjs'}
  },
  module: {rules: [ts, wasm]},
  resolve: {
    extensions: [ '.ts', '.js' ],
  },
  externals: [{'@wasmer/wasi/lib': 'commonjs @wasmer/wasi'}, nodeExternals()]
}];
