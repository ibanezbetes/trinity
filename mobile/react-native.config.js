module.exports = {
  // Asset configuration
  assets: ['./assets/'],
  
  // Dependencies configuration
  dependencies: {
    // Ensure Google Sign-In is properly linked
    '@react-native-google-signin/google-signin': {
      platforms: {
        android: {
          sourceDir: '../node_modules/@react-native-google-signin/google-signin/android',
          packageImportPath: 'import io.invertase.googlesignin.RNGoogleSigninPackage;',
        },
      },
    },
  },
};