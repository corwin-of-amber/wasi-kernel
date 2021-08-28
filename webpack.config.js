const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = (env, argv) => ({
  name: 'worker',
  mode: argv.mode || 'development',
  entry: './src/kernel/worker.ts',
  devtool: argv.mode !== 'production' ? "source-map" : undefined,
  stats: {
    hash: false, version: false, modules: false  // reduce verbosity
  },
  output: {
    filename: 'worker.js',
    path: `${__dirname}/dist`
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
            loader: 'ts-loader', 
            options: {allowTsInNodeModules: true} // useful for development
        }
      }
    ],
  },
  resolve: {
    extensions: [ '.ts', '.js' ],
    fallback: {
        url: false, crypto: false, tty: false, worker_threads: false,
        path: require.resolve("path-browserify"),
        stream: require.resolve("stream-browserify")
    }
  },
  externals: {
    fs: 'commonjs2 fs'
  },
  plugins: [
    new webpack.DefinePlugin({ 'process': {browser: true, env: {}} }),
    new webpack.ProvidePlugin({ 'Buffer': ['buffer', 'Buffer'] }),
    //new BundleAnalyzerPlugin()
  ]
});
