/**
 * Test script to verify all service imports work correctly
 */

console.log('🔍 Testing service imports...');

try {
  // Test the main service imports that were failing
  console.log('Testing backgroundTokenRefreshService...');
  const { backgroundTokenRefreshService } = require('./src/services/backgroundTokenRefreshService');
  console.log('✅ backgroundTokenRefreshService imported successfully');

  console.log('Testing cognitoAuthService...');
  const { cognitoAuthService } = require('./src/services/cognitoAuthService');
  console.log('✅ cognitoAuthService imported successfully');

  console.log('Testing dualAuthFlowService...');
  const { dualAuthFlowService } = require('./src/services/dualAuthFlowService');
  console.log('✅ dualAuthFlowService imported successfully');

  console.log('Testing sessionExpirationService...');
  const { sessionExpirationService } = require('./src/services/sessionExpirationService');
  console.log('✅ sessionExpirationService imported successfully');

  console.log('Testing migrationService...');
  const { migrationService } = require('./src/services/migrationService');
  console.log('✅ migrationService imported successfully');

  console.log('\n🎉 All service imports working correctly!');

} catch (error) {
  console.error('❌ Import error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}