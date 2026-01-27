/**
 * Test individual service imports to identify the problematic one
 */

console.log('🔍 Testing individual service imports...');

const testImport = async (serviceName, importPath) => {
  try {
    console.log(`Testing ${serviceName}...`);
    
    // Use dynamic import to avoid compilation issues
    const module = await import(importPath);
    
    if (module[serviceName]) {
      console.log(`✅ ${serviceName} imported successfully`);
      return true;
    } else {
      console.log(`❌ ${serviceName} not found in module`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${serviceName} import failed:`, error.message);
    return false;
  }
};

const runTests = async () => {
  const services = [
    ['cognitoAuthService', './src/services/cognitoAuthService.js'],
    ['dualAuthFlowService', './src/services/dualAuthFlowService.js'],
    ['backgroundTokenRefreshService', './src/services/backgroundTokenRefreshService.js'],
    ['sessionExpirationService', './src/services/sessionExpirationService.js'],
    ['migrationService', './src/services/migrationService.js']
  ];
  
  for (const [serviceName, importPath] of services) {
    await testImport(serviceName, importPath);
  }
};

runTests().catch(console.error);