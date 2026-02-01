#!/usr/bin/env node

/**
 * Simplified Trinity APK Production Build Script
 * This script builds a production APK with CDK-managed AWS configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Trinity Production APK Build Starting...');

// Production configuration (CDK-managed endpoints)
const PRODUCTION_CONFIG = {
  NODE_ENV: 'production',
  __DEV__: false,
  AWS_REGION: 'eu-west-1',
  GRAPHQL_ENDPOINT: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  REALTIME_ENDPOINT: 'wss://imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
  COGNITO_USER_POOL_ID: 'eu-west-1_6UxioIj4z',
  COGNITO_CLIENT_ID: '2a07bheqdh1mllkd1sn0i3s5m3',
};

function setupEnvironment() {
  console.log('🔧 Setting up production environment...');
  
  // Set environment variables
  Object.assign(process.env, PRODUCTION_CONFIG);
  
  // Create assets directory
  const assetsDir = path.join('android', 'app', 'src', 'main', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
    console.log('📁 Assets directory created');
  }
  
  // Write production configuration
  const configPath = path.join(assetsDir, 'production-config.json');
  fs.writeFileSync(configPath, JSON.stringify(PRODUCTION_CONFIG, null, 2));
  console.log('✅ Production configuration written');
}

function checkDependencies() {
  console.log('📦 Checking dependencies...');
  
  if (!fs.existsSync('node_modules')) {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  } else {
    console.log('✅ Dependencies already installed');
  }
}

function buildBundle() {
  console.log('🔧 Building JavaScript bundle...');
  
  const assetsDir = path.join('android', 'app', 'src', 'main', 'assets');
  const bundlePath = path.join(assetsDir, 'index.android.bundle');
  
  // Build production bundle
  const bundleCommand = [
    'npx @react-native-community/cli bundle',
    '--platform android',
    '--dev false',
    '--entry-file index.js',
    `--bundle-output "${bundlePath}"`,
    '--assets-dest android/app/src/main/res',
    '--reset-cache',
    '--minify true'
  ].join(' ');
  
  console.log('📝 Running bundle command...');
  try {
    execSync(bundleCommand, { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Bundle command failed:', error.message);
    throw error;
  }
  
  // Verify bundle was created
  if (!fs.existsSync(bundlePath)) {
    throw new Error('❌ Failed to generate JavaScript bundle');
  }
  
  const bundleSize = fs.statSync(bundlePath).size;
  console.log(`✅ Bundle created: ${(bundleSize / 1024 / 1024).toFixed(2)} MB`);
  
  // Check for localhost references
  const bundleContent = fs.readFileSync(bundlePath, 'utf8');
  if (bundleContent.includes('localhost') || bundleContent.includes('127.0.0.1')) {
    console.warn('⚠️ Warning: Bundle contains localhost references (this is normal for React Native debugging)');
  } else {
    console.log('✅ Bundle verified - no localhost references');
  }
}

function setupAndroidSDK() {
  console.log('🤖 Setting up Android SDK...');
  
  // Try to find Android SDK
  const possiblePaths = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
    'C:\\Android\\Sdk'
  ].filter(Boolean);
  
  let androidHome = null;
  for (const sdkPath of possiblePaths) {
    if (fs.existsSync(sdkPath)) {
      androidHome = sdkPath;
      break;
    }
  }
  
  if (androidHome) {
    process.env.ANDROID_HOME = androidHome;
    process.env.ANDROID_SDK_ROOT = androidHome;
    console.log(`🤖 Android SDK found: ${androidHome}`);
    
    // Create local.properties
    const localPropsPath = path.join('android', 'local.properties');
    if (!fs.existsSync(localPropsPath)) {
      const sdkDir = androidHome.replace(/\\/g, '/');
      fs.writeFileSync(localPropsPath, `sdk.dir=${sdkDir}\n`);
      console.log('📝 local.properties created');
    }
  } else {
    console.warn('⚠️ Android SDK not found. Make sure ANDROID_HOME is set.');
  }
}

function buildAPK() {
  console.log('🔨 Building APK with Gradle...');
  
  const originalDir = process.cwd();
  
  try {
    process.chdir('android');
    
    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    
    // Build release APK
    console.log('🔨 Building Release APK...');
    execSync(`${gradlewCmd} assembleRelease`, { stdio: 'inherit' });
    
  } catch (error) {
    throw new Error(`❌ Gradle build failed: ${error.message}`);
  } finally {
    process.chdir(originalDir);
  }
}

function copyAPK() {
  console.log('📦 Copying APK to output directory...');
  
  const apkPath = path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  
  if (!fs.existsSync(apkPath)) {
    throw new Error(`❌ APK not found at: ${apkPath}`);
  }
  
  const outputName = 'trinity-production.apk';
  const outputPath = path.join('.', outputName);
  
  fs.copyFileSync(apkPath, outputPath);
  
  const apkSize = fs.statSync(outputPath).size;
  console.log(`✅ APK built successfully!`);
  console.log(`📍 Location: ${path.resolve(outputPath)}`);
  console.log(`📦 Size: ${(apkSize / 1024 / 1024).toFixed(2)} MB`);
  
  return outputPath;
}

async function main() {
  try {
    console.log('🎬 Trinity Production APK Build');
    console.log('================================');
    
    setupEnvironment();
    checkDependencies();
    setupAndroidSDK();
    buildBundle();
    buildAPK();
    const apkPath = copyAPK();
    
    console.log('\n🎉 Build completed successfully!');
    console.log('📱 Installation commands:');
    console.log(`   adb install -r ${path.basename(apkPath)}`);
    console.log('   adb shell pm list packages | grep trinity');
    console.log('   adb logcat | grep Trinity');
    
    console.log('\n🔗 CDK-Managed Endpoints:');
    console.log(`   GraphQL: ${PRODUCTION_CONFIG.GRAPHQL_ENDPOINT}`);
    console.log(`   Realtime: ${PRODUCTION_CONFIG.REALTIME_ENDPOINT}`);
    console.log(`   Cognito: ${PRODUCTION_CONFIG.COGNITO_USER_POOL_ID}`);
    
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   - Ensure Android SDK is installed and ANDROID_HOME is set');
    console.error('   - Ensure Java 17 is installed and JAVA_HOME is set');
    console.error('   - Run "npm install" to ensure dependencies are installed');
    console.error('   - Make sure no Metro bundler is running');
    console.error('   - Try running from WSL if on Windows');
    process.exit(1);
  }
}

// Run the build
main();