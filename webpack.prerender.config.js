// Node build of src/prerender/renderHome.tsx, run by `postbuild` before
// scripts/prerender_routes.mjs, which calls it to put the real landing page
// into dist/index.html. Same Babel setup as webpack.config.js; styles are
// dropped (the browser gets them from the client build) and images resolve to
// the same hashed URLs the client build emits, without emitting them again.
const path = require('path');
const webpack = require('webpack');
const client = require('./webpack.config.js');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './src/prerender/renderHome.tsx',
  output: {
    path: path.resolve(__dirname, 'build', 'prerender'),
    filename: 'renderHome.js',
    library: { type: 'commonjs2' },
    publicPath: '/',
    clean: true,
  },
  module: {
    rules: [
      client.module.rules[0],
      { test: /\.css$/, type: 'asset/source' },
      { test: /\.(png|jpg|gif|svg)$/i, type: 'asset/resource', generator: { emit: false } },
    ],
  },
  resolve: client.resolve,
  // One file: lazy routes are never awaited by renderToString (Suspense
  // renders its fallback), so their code only needs to be present, not split.
  plugins: [new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
  optimization: { minimize: false },
  performance: { hints: false },
};
