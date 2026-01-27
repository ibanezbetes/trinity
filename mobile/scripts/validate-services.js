#!/usr/bin/env node

/**
 * Service Validation Script
 * Validates that all required services exist and are properly exported
 * before EAS build process begins
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_SERVICES = [
  'src/services/backgroundTokenRefreshService.ts',
  'src/services/cognitoAuthService.ts',
  'src/services/dualAuthFlowService.ts',
  'src/services/sessionExpirationService.ts',
  'src/services/migrationService.ts',
  'src/services/secureTokenStorage.ts',
  'src/services/loggingService.ts',
  'src/services/networkService.ts'
];

const REQUIRED_CONTEXTS = [
  'src/context/CognitoAuthContext.tsx'
];

function validateFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing required file: ${filePath}`);
    return false;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Check if file has exports
  if (!content.includes('export')) {
    console.error(`❌ File has no exports: ${filePath}`);
    return false;
  }
  
  console.log(`✅ Validated: ${filePath}`);
  return true;
}

function validateImports() {
  const contextPath = path.join(__dirname, '..', 'src/context/CognitoAuthContext.tsx');
  
  if (!fs.existsSync(contextPath)) {
    console.error('❌ CognitoAuthContext.tsx not found');
    return false;
  }
  
  const content = fs.readFileSync(contextPath, 'utf8');
  
  // Check for the problematic import
  const backgroundServiceImport = content.match(/import.*backgroundTokenRefreshService.*from.*['"](.+)['"];?/);
  
  if (!backgroundServiceImport) {
    console.error('❌ backgroundTokenRefreshService import not found in CognitoAuthContext');
    return false;
  }
  
  const importPath = backgroundServiceImport[1];
  console.log(`📦 Found import: ${importPath}`);
  
  // Resolve the import path
  const resolvedPath = path.resolve(path.dirname(contextPath), importPath + '.ts');
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Import path does not resolve to existing file: ${resolvedPath}`);
    return false;
  }
  
  console.log(`✅ Import resolves correctly: ${resolvedPath}`);
  return true;
}

function main() {
  console.log('🔍 Validating services for EAS build...');
  
  let allValid = true;
  
  // Validate required service files
  console.log('\n📋 Checking required services:');
  for (const service of REQUIRED_SERVICES) {
    if (!validateFile(service)) {
      allValid = false;
    }
  }
  
  // Validate required context files
  console.log('\n📋 Checking required contexts:');
  for (const context of REQUIRED_CONTEXTS) {
    if (!validateFile(context)) {
      allValid = false;
    }
  }
  
  // Validate imports
  console.log('\n📋 Checking imports:');
  if (!validateImports()) {
    allValid = false;
  }
  
  if (allValid) {
    console.log('\n✅ All services validated successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Service validation failed!');
    process.exit(1);
  }
}

main();