const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    clean: true,
    publicPath: '/'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              ['@babel/preset-react', { runtime: 'automatic' }],
              '@babel/preset-typescript'
            ],
            plugins: [
              '@babel/plugin-transform-runtime'
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader'
        ]
      },
      {
        test: /\.(png|jpg|gif|svg)$/i,
        type: 'asset/resource'
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js']
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      favicon: './public_original/assets/logo.png'
    }),
    new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash].css'
    }),
    new CopyWebpackPlugin({
      patterns: [
        // Allow copying CSVs from both public_original/data (canonical) and public/data (uploaded extras)
        // If duplicates exist, later entries overwrite earlier ones.
        // The 762KB *_FULL_DETAIL_ORIGINAL.csv is never fetched at runtime -> excluded.
        {
          from: 'public/data',
          to: 'data',
          noErrorOnMissing: true,
          globOptions: { ignore: ['**/EdLight_All_Videos_FULL_DETAIL_ORIGINAL.csv'] },
        },
        {
          from: 'public_original/data',
          to: 'data',
          globOptions: { ignore: ['**/EdLight_All_Videos_FULL_DETAIL_ORIGINAL.csv'] },
        },
        {
          from: 'public_original/assets',
          to: 'assets'
        },
        // NOTE: public/exam_catalog.json (26MB) is intentionally NOT copied.
        // Users load tiny per-exam files; the admin tool reconstructs the full
        // catalog on demand. It stays in public/ as the source for data scripts.
        {
          from: 'public/exam_catalog_index.json',
          to: 'exam_catalog_index.json',
          noErrorOnMissing: true
        },
        // Per-exam files: opening one exam now downloads ~30KB instead of 27MB.
        {
          from: 'public/exams',
          to: 'exams',
          noErrorOnMissing: true
        },
        // PWA: service worker, manifest and icons served from the site root.
        {
          from: 'pwa',
          to: '.',
          noErrorOnMissing: true
        }
      ]
    })
  ],
  devServer: {
    historyApiFallback: true,
    hot: true,
    port: 3000,
    static: {
      directory: path.join(__dirname, 'public')
    }
  },
  optimization: {
    // '...' keeps the default JS (terser) minimizer; add CSS minification on top.
    // Both only run in production mode, so dev output stays readable.
    minimizer: [
      '...',
      new CssMinimizerPlugin(),
    ],
    // Pull the webpack runtime into its own tiny file so the app/vendor chunk
    // hashes stay stable across deploys (returning visitors re-use cached JS).
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      // Generous request budgets so the named groups below are never merged
      // back into one another (which is what caused the duplication below).
      maxInitialRequests: 30,
      maxAsyncRequests: 30,
      cacheGroups: {
        // Firebase (~300 KB minified) is only needed by data-driven routes.
        // Forcing it into ONE named chunk stops every lazy route that touches
        // Firestore from shipping its own private copy.
        firebase: {
          test: /[\\/]node_modules[\\/]@?firebase[\\/]/,
          name: 'firebase',
          priority: 40,
          reuseExistingChunk: true,
        },
        // React core is shared by the shell and every route -> a single stable,
        // cache-friendly chunk instead of a copy duplicated into async chunks.
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
          name: 'react',
          priority: 30,
          reuseExistingChunk: true,
        },
        // i18next was being duplicated into a lazy chunk; pin it to one file.
        i18n: {
          test: /[\\/]node_modules[\\/](i18next[-\w]*|react-i18next)[\\/]/,
          name: 'i18n',
          priority: 28,
          reuseExistingChunk: true,
        },
        // react-markdown + its remark/micromark/mdast/unist/hast ecosystem is
        // heavy and used by a few routes; collapse it into one shared chunk.
        markdown: {
          test: /[\\/]node_modules[\\/](react-markdown|remark[-\w]*|micromark[-\w]*|mdast[-\w]*|unist[-\w]*|hast[-\w]*|unified|bail|trough|vfile[-\w]*|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities[-\w]*|html-void-elements|zwitch|web-namespaces|is-plain-obj)[\\/]/,
          name: 'markdown',
          priority: 25,
          reuseExistingChunk: true,
        },
      },
    },
  }
};