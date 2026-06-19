/**
 * Babel config used ONLY by Jest (babel-jest).
 *
 * Webpack does its own transpilation via the inline `babel-loader` options in
 * webpack.config.js, so this file deliberately returns an *empty* config for
 * every environment except `test`. That keeps the production/dev bundle
 * behaviour exactly as before while giving babel-jest the presets it needs to
 * understand TS + JSX in the test run (Jest sets NODE_ENV=test).
 */
module.exports = (api) => {
  const isTest = api.env('test');
  api.cache.using(() => process.env.NODE_ENV);

  if (!isTest) return {};

  return {
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
      ['@babel/preset-react', { runtime: 'automatic' }],
      '@babel/preset-typescript',
    ],
  };
};
