const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for Google Sign-In native modules
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Ensure proper handling of Google Sign-In dependencies
config.resolver.assetExts.push('plist', 'json');

// Ensure TypeScript files are properly resolved
config.resolver.sourceExts = [...config.resolver.sourceExts, 'ts', 'tsx'];

// Production bundle configuration
config.serializer = {
  ...config.serializer,
  getModulesRunBeforeMainModule: () => [
    require.resolve('react-native/Libraries/Core/InitializeCore'),
  ],
};

// Disable Metro server for production builds
if (process.env.NODE_ENV === 'production') {
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Disable Metro server in production
        res.status(404).end();
      };
    },
  };
}

module.exports = config;