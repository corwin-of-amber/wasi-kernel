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
    module: {rules: [wasm, ts], parser: {javascript: {url: false}}},
    optimization: {
      minimizer: [
        new TerserPlugin({  /* this is a hack because wasmer-js checks the class name */
          terserOptions: { keep_fnames: /^MemFS$/ }
        })
      ],
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
  type: 'asset/resource',
  generator: {filename: "[name][ext]"}
};
const modules = (modnames) =>
  Object.fromEntries(modnames.map(m => [m, `commonjs ${m}`]));

module.exports = (env, argv) => [{
  name: 'worker',
  entry: './src/worker.webpack.js',
  target: 'webworker',
  output: {
    filename: 'worker.js',
    path: `${__dirname}/dist`
  },
  ...base(argv),
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
  entry: {
    index: './src/index.ts',
    services: './src/services/index.ts'
  },
  ...base(argv),
  experiments: {
    outputModule: true
  },
  output: {
    filename: '[name].mjs',
    path: `${__dirname}/dist/`,
    library: {type: 'module'},
    chunkFormat: 'module'
  },
  resolve: {
    extensions: [ '.ts', '.js' ],
  },
  externalsType: 'module',
  externals: {
    ...modules(['fs', 'path', 'worker_threads', 'constants']),
    '@wasmer/sdk': '@wasmer/sdk'
  },
  plugins: [
    new webpack.ProvidePlugin({Buffer: ['buffer', 'Buffer'],
                               process: 'process/browser' }),
    //new BundleAnalyzerPlugin()
  ],
  optimization: {
    splitChunks: {
      chunks: 'all', minSize: 0,
      name: 'shared.chunk',
    },
  }
},
{
  name: 'cjs',
  target: 'node',
  entry: './src/index.ts',
  ...base(argv),
  output: {
    filename: 'index.cjs',
    path: `${__dirname}/lib/kernel`,
    library: {type: 'commonjs'}
  },
  resolve: {
    extensions: [ '.ts', '.js' ],
  },
  externals: [{'@wasmer/wasi/lib': 'commonjs @wasmer/wasi'}, nodeExternals()]
}];
