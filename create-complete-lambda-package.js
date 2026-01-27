#!/usr/bin/env node

/**
 * Create complete Lambda deployment package with all dependencies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Creating complete Lambda deployment package...');

try {
  // Create a temporary directory for the package
  const tempDir = 'lambda-package-temp';
  
  if (fs.existsSync(tempDir)) {
    execSync(`rmdir /s /q ${tempDir}`, { stdio: 'inherit' });
  }
  
  fs.mkdirSync(tempDir);
  fs.mkdirSync(path.join(tempDir, 'services'));
  
  console.log('📋 Copying handler files...');
  
  // Copy main handler
  fs.copyFileSync('infrastructure/src/handlers/movie.js', path.join(tempDir, 'movie.js'));
  
  // Copy all service files
  const servicesDir = 'infrastructure/src/services';
  if (fs.existsSync(servicesDir)) {
    const serviceFiles = fs.readdirSync(servicesDir);
    serviceFiles.forEach(file => {
      if (file.endsWith('.js')) {
        fs.copyFileSync(path.join(servicesDir, file), path.join(tempDir, 'services', file));
        console.log(`  ✅ Copied ${file}`);
      }
    });
  }
  
  // Copy types if they exist
  const typesDir = 'infrastructure/src/types';
  if (fs.existsSync(typesDir)) {
    fs.mkdirSync(path.join(tempDir, 'types'));
    const typeFiles = fs.readdirSync(typesDir);
    typeFiles.forEach(file => {
      if (file.endsWith('.js')) {
        fs.copyFileSync(path.join(typesDir, file), path.join(tempDir, 'types', file));
        console.log(`  ✅ Copied ${file}`);
      }
    });
  }
  
  // Copy utils if they exist
  const utilsDir = 'infrastructure/src/utils';
  if (fs.existsSync(utilsDir)) {
    fs.mkdirSync(path.join(tempDir, 'utils'));
    const utilFiles = fs.readdirSync(utilsDir);
    utilFiles.forEach(file => {
      if (file.endsWith('.js')) {
        fs.copyFileSync(path.join(utilsDir, file), path.join(tempDir, 'utils', file));
        console.log(`  ✅ Copied ${file}`);
      }
    });
  }
  
  // Create package.json
  const packageJson = {
    "name": "trinity-movie-handler",
    "version": "1.0.0",
    "main": "movie.js",
    "dependencies": {
      "@aws-sdk/client-dynamodb": "^3.0.0",
      "@aws-sdk/lib-dynamodb": "^3.0.0"
    }
  };
  
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  
  console.log('🗜️ Creating zip file...');
  
  // Create zip file
  execSync(`powershell Compress-Archive -Path ${tempDir}\\* -DestinationPath movie-handler-complete.zip -Force`, { stdio: 'inherit' });
  
  console.log('🧹 Cleaning up...');
  execSync(`rmdir /s /q ${tempDir}`, { stdio: 'inherit' });
  
  console.log('✅ Complete Lambda package created: movie-handler-complete.zip');
  
  // Now deploy it
  console.log('🚀 Deploying to Lambda...');
  
  const result = execSync('aws lambda update-function-code --function-name trinity-movie-dev --zip-file fileb://movie-handler-complete.zip', { encoding: 'utf8' });
  
  console.log('✅ Lambda function updated successfully!');
  console.log('');
  console.log('📱 The getAvailableGenres function should now work correctly.');
  console.log('Test it by opening the mobile app and switching between "Películas" and "Series".');
  
} catch (error) {
  console.error('❌ Error creating package:', error.message);
  process.exit(1);
}
