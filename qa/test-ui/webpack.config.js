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
  type: 'asset/resource',
  generator: {
    filename: "[name][ext]"
  }
};
const modules = (modnames) =>
  Object.fromEntries(modnames.map(m => [m, `module ${m}`]));

module.exports = (env, argv) => [{
  name: 'app',
  entry: './src/main.ts',
  target: 'web',
  output: {
    filename: 'main.js',
    path: `${__dirname}/dist`
  },
  ...base(argv),
  module: {rules: [ts, wasm], parser: {javascript: {url: false}}},
  resolve: {
    extensions: [ '.ts', '.js' ],
    fallback: {
        url: false, crypto: false, tty: false, worker_threads: false, constants: false,
        path: require.resolve("path-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/")
    }
  },
  /*externals: {
    fs: 'commonjs2 fs'
  },*/
  
  plugins: [
    new webpack.ProvidePlugin({Buffer: ['buffer', 'Buffer'],
                               process: 'process/browser' }),
    //new BundleAnalyzerPlugin()
  ]
}];
