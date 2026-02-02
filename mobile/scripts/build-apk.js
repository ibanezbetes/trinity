#!/usr/bin/env node

/**
 * Simplified APK Build Script for Trinity
 * Uses standard React Native CLI and Gradle build process
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  production: {
    NODE_ENV: 'production',
    __DEV__: false,
    AWS_REGION: 'eu-west-1',
    GRAPHQL_ENDPOINT: 'https://b7vef3wm6jhfddfazbpru5ngki.appsync-api.eu-west-1.amazonaws.com/graphql',
    REALTIME_ENDPOINT: 'wss://b7vef3wm6jhfddfazbpru5ngki.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
    COGNITO_USER_POOL_ID: 'eu-west-1_TSlG71OQi',
    COGNITO_CLIENT_ID: '3k120srs09npek1qbfhgip63n',
  },
  development: {
    NODE_ENV: 'development',
    __DEV__: true,
    AWS_REGION: 'eu-west-1',
    GRAPHQL_ENDPOINT: 'https://b7vef3wm6jhfddfazbpru5ngki.appsync-api.eu-west-1.amazonaws.com/graphql',
    REALTIME_ENDPOINT: 'wss://b7vef3wm6jhfddfazbpru5ngki.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
    COGNITO_USER_POOL_ID: 'eu-west-1_TSlG71OQi',
    COGNITO_CLIENT_ID: '3k120srs09npek1qbfhgip63n',
  }
};

class APKBuilder {
  constructor(buildType = 'production') {
    this.buildType = buildType;
    this.config = CONFIG[buildType];
    this.workingDir = this.findMobileDirectory();
    
    if (!this.config) {
      throw new Error(`Invalid build type: ${buildType}. Use 'production' or 'development'`);
    }
    
    console.log(`🚀 Building Trinity APK (${buildType} mode)...`);
  }

  findMobileDirectory() {
    let workingDir = process.cwd();
    
    // If we're in the root trinity directory, change to mobile
    if (!fs.existsSync('package.json') && fs.existsSync('mobile/package.json')) {
      workingDir = path.join(process.cwd(), 'mobile');
      process.chdir(workingDir);
      console.log(`📁 Changed to mobile directory: ${workingDir}`);
    } else if (!fs.existsSync('package.json')) {
      throw new Error('❌ package.json not found. Run from trinity/ or trinity/mobile/ directory');
    }
    
    return workingDir;
  }

  setupEnvironment() {
    console.log('🔧 Setting up build environment...');
    
    // Set environment variables
    Object.assign(process.env, this.config);
    
    // Create assets directory
    const assetsDir = path.join('android', 'app', 'src', 'main', 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
      console.log('📁 Assets directory created');
    }
    
    // Write configuration file
    const configPath = path.join(assetsDir, `${this.buildType}-config.json`);
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    console.log(`✅ ${this.buildType} configuration written`);
    
    // Setup Android SDK paths
    this.setupAndroidSDK();
  }

  setupAndroidSDK() {
    console.log('🤖 Setting up Android SDK paths...');
    
    if (process.platform === 'win32') {
      // Windows SDK locations
      const androidLocations = [
        path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
        path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
        'C:\\Android\\Sdk',
        process.env.ANDROID_HOME
      ].filter(Boolean);
      
      for (const location of androidLocations) {
        if (fs.existsSync(location)) {
          process.env.ANDROID_HOME = location;
          process.env.ANDROID_SDK_ROOT = location;
          console.log(`🤖 Android SDK found: ${location}`);
          break;
        }
      }
    } else {
      // Unix/Linux/macOS
      const androidHome = process.env.ANDROID_HOME || `${process.env.HOME}/Android/Sdk`;
      if (fs.existsSync(androidHome)) {
        process.env.ANDROID_HOME = androidHome;
        process.env.ANDROID_SDK_ROOT = androidHome;
        console.log(`🤖 Android SDK: ${androidHome}`);
      }
    }
    
    // Create local.properties if needed
    const localPropsPath = path.join('android', 'local.properties');
    if (!fs.existsSync(localPropsPath) && process.env.ANDROID_HOME) {
      let sdkDir = process.env.ANDROID_HOME;
      if (process.platform === 'win32') {
        sdkDir = sdkDir.replace(/\\/g, '/');
      }
      fs.writeFileSync(localPropsPath, `sdk.dir=${sdkDir}\n`);
      console.log('📝 local.properties created');
    }
  }

  installDependencies() {
    console.log('📦 Checking dependencies...');
    
    if (!fs.existsSync('node_modules')) {
      console.log('📦 Installing dependencies...');
      execSync('npm install', { stdio: 'inherit' });
    } else {
      console.log('✅ Dependencies already installed');
    }
  }

  buildBundle() {
    console.log('🔧 Building JavaScript bundle...');
    
    const assetsDir = path.join('android', 'app', 'src', 'main', 'assets');
    const bundlePath = path.join(assetsDir, 'index.android.bundle');
    
    // Use React Native CLI to build bundle
    const bundleCommand = [
      'npx react-native bundle',
      '--platform android',
      `--dev ${this.buildType === 'development'}`,
      '--entry-file index.js',
      `--bundle-output "${bundlePath}"`,
      '--assets-dest android/app/src/main/res',
      '--reset-cache',
      `--minify ${this.buildType === 'production'}`
    ].join(' ');
    
    console.log('📝 Running:', bundleCommand);
    execSync(bundleCommand, { stdio: 'inherit' });
    
    // Verify bundle was created
    if (!fs.existsSync(bundlePath)) {
      throw new Error('Failed to generate JavaScript bundle');
    }
    
    const bundleSize = fs.statSync(bundlePath).size;
    console.log(`✅ Bundle created: ${(bundleSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Verify no localhost references in production
    if (this.buildType === 'production') {
      const bundleContent = fs.readFileSync(bundlePath, 'utf8');
      if (bundleContent.includes('localhost') || bundleContent.includes('127.0.0.1')) {
        console.warn('⚠️ Warning: Bundle contains localhost references');
      } else {
        console.log('✅ Bundle verified - no localhost references');
      }
    }
  }

  buildAPK() {
    console.log('🔨 Building APK with Gradle...');
    
    process.chdir('android');
    
    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const buildVariant = this.buildType === 'production' ? 'Release' : 'Debug';
    
    try {
      // Clean build (skip on Windows to avoid file lock issues)
      if (process.platform !== 'win32') {
        console.log('🧹 Cleaning previous build...');
        execSync(`${gradlewCmd} clean`, { stdio: 'inherit' });
      }
      
      // Build APK
      console.log(`🔨 Building ${buildVariant} APK...`);
      execSync(`${gradlewCmd} assemble${buildVariant}`, { stdio: 'inherit' });
      
    } catch (error) {
      throw new Error(`Gradle build failed: ${error.message}`);
    } finally {
      // Return to mobile directory
      process.chdir('..');
    }
  }

  copyAPK() {
    console.log('📦 Copying APK to output directory...');
    
    const buildVariant = this.buildType === 'production' ? 'release' : 'debug';
    const apkName = `app-${buildVariant}.apk`;
    const apkPath = path.join('android', 'app', 'build', 'outputs', 'apk', buildVariant, apkName);
    
    if (!fs.existsSync(apkPath)) {
      throw new Error(`APK not found at: ${apkPath}`);
    }
    
    const outputName = `trinity-${this.buildType}.apk`;
    const outputPath = path.join('.', outputName);
    
    fs.copyFileSync(apkPath, outputPath);
    
    const apkSize = fs.statSync(outputPath).size;
    console.log(`✅ APK built successfully!`);
    console.log(`📍 Location: ${path.resolve(outputPath)}`);
    console.log(`📦 Size: ${(apkSize / 1024 / 1024).toFixed(2)} MB`);
    
    return outputPath;
  }

  async build() {
    try {
      this.setupEnvironment();
      this.installDependencies();
      this.buildBundle();
      this.buildAPK();
      const apkPath = this.copyAPK();
      
      console.log('\n🎉 Build completed successfully!');
      console.log(`📱 To install: adb install ${path.basename(apkPath)}`);
      
      return apkPath;
      
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      console.error('\n💡 Troubleshooting:');
      console.error('   - Ensure Android SDK is installed and ANDROID_HOME is set');
      console.error('   - Ensure Java 17 is installed and JAVA_HOME is set');
      console.error('   - Run "npm install" to ensure dependencies are installed');
      console.error('   - Check that no Metro bundler is running');
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const buildType = process.argv[2] || 'production';
  
  if (!['production', 'development'].includes(buildType)) {
    console.error('Usage: node build-apk.js [production|development]');
    process.exit(1);
  }
  
  const builder = new APKBuilder(buildType);
  builder.build().catch(() => process.exit(1));
}

module.exports = APKBuilder;