const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// With unstable_enablePackageExports=true (Expo default), Metro reads the
// package "exports" field but ships with an empty conditionNames list, so it
// always falls through to the "default" condition (usually the browser ESM
// build). Adding 'react-native' here makes Firebase, and any other package
// with an exports["react-native"] entry, resolve to the correct RN bundle.
config.resolver.unstable_conditionNames = ['react-native', 'require', 'default'];

// Apply NativeWind FIRST so its resolveRequest is installed, then wrap it
// with our resolver so ours runs first in the chain.
const nativeWindConfig = withNativeWind(config, { input: './global.css' });
const nativeWindResolver = nativeWindConfig.resolver.resolveRequest;

nativeWindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  // @react-navigation/* → always use compiled CJS (lib/commonjs/index.js),
  // never the raw TypeScript source pointed to by the "react-native" field.
  // If different packages resolve to different builds of NavigationStateContext
  // the provider's context object differs from the consumer's, producing
  // "Couldn't find a navigation context" even inside a NavigationContainer.
  if (moduleName.startsWith('@react-navigation/')) {
    try {
      const pkgJsonPath = require.resolve(
        `${moduleName}/package.json`,
        { paths: [context.originModulePath ? path.dirname(context.originModulePath) : __dirname] }
      );
      const pkg = require(pkgJsonPath);
      const pkgDir = path.dirname(pkgJsonPath);
      const mainFile = pkg.main || 'index.js';
      return { filePath: path.resolve(pkgDir, mainFile), type: 'sourceFile' };
    } catch (_) {
      // fall through
    }
  }

  // firebase/* wrappers (e.g. "firebase/auth") have no "react-native" field
  // so Metro falls back to "browser" (ESM) which lacks RN component
  // registration. Force "main" (CJS) instead.
  if (moduleName.startsWith('firebase/') && !moduleName.includes('/node_modules/')) {
    try {
      const pkgJsonPath = require.resolve(
        `${moduleName}/package.json`,
        { paths: [__dirname] }
      );
      const pkg = require(pkgJsonPath);
      const pkgDir = path.dirname(pkgJsonPath);
      const mainFile = pkg.main || 'index.js';
      return { filePath: path.resolve(pkgDir, mainFile), type: 'sourceFile' };
    } catch (_) {
      // fall through
    }
  }

  return nativeWindResolver
    ? nativeWindResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = nativeWindConfig;
