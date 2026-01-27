const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for Google Sign-In native modules
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Ensure proper handling of Google Sign-In dependencies
config.resolver.assetExts.push('plist', 'json');

// Ensure TypeScript files are properly resolved
config.resolver.sourceExts = [...config.resolver.sourceExts, 'ts', 'tsx'];

module.exports = config;