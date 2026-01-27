/**
 * Diagnóstico de problemas en APK compilado
 * 1. Google Sign-In configuration error
 * 2. Vote registration failing
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 DIAGNÓSTICO DE PROBLEMAS EN APK');
console.log('=====================================');

// 1. Verificar configuración de Google Sign-In
console.log('\n1. GOOGLE SIGN-IN CONFIGURATION:');
console.log('----------------------------------');

try {
  const appJsonPath = path.join(__dirname, 'mobile', 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  
  console.log('✅ app.json found');
  console.log('📱 Package name:', appJson.expo?.android?.package);
  console.log('🔑 Google Web Client ID:', appJson.expo?.extra?.googleWebClientId);
  console.log('🤖 Google Android Client ID:', appJson.expo?.extra?.googleAndroidClientId);
  
  // Check google-services.json
  const googleServicesPath = path.join(__dirname, 'mobile', 'google-services.json');
  if (fs.existsSync(googleServicesPath)) {
    const googleServices = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
    console.log('✅ google-services.json found');
    console.log('📱 Project ID:', googleServices.project_info?.project_id);
    console.log('🔢 Project Number:', googleServices.project_info?.project_number);
    
    // Check if client IDs match
    const clientIds = googleServices.client?.[0]?.oauth_client?.map(c => c.client_id) || [];
    console.log('🔑 OAuth Client IDs in google-services.json:', clientIds);
    
    const webClientId = appJson.expo?.extra?.googleWebClientId;
    const androidClientId = appJson.expo?.extra?.googleAndroidClientId;
    
    console.log('\n🔍 MATCHING CHECK:');
    console.log('Web Client ID matches:', clientIds.includes(webClientId) ? '✅' : '❌');
    console.log('Android Client ID matches:', clientIds.includes(androidClientId) ? '✅' : '❌');
  } else {
    console.log('❌ google-services.json NOT FOUND');
  }
  
} catch (error) {
  console.error('❌ Error checking Google configuration:', error.message);
}

// 2. Verificar configuración de AWS/AppSync
console.log('\n2. AWS/APPSYNC CONFIGURATION:');
console.log('------------------------------');

try {
  const awsConfigPath = path.join(__dirname, 'mobile', 'src', 'config', 'aws-config.ts');
  const awsConfig = fs.readFileSync(awsConfigPath, 'utf8');
  
  console.log('✅ aws-config.ts found');
  
  // Extract key values
  const graphqlMatch = awsConfig.match(/graphqlEndpoint:\s*'([^']+)'/);
  const realtimeMatch = awsConfig.match(/realtimeEndpoint:\s*'([^']+)'/);
  const userPoolMatch = awsConfig.match(/userPoolId:\s*'([^']+)'/);
  const clientIdMatch = awsConfig.match(/userPoolWebClientId:\s*'([^']+)'/);
  
  console.log('🔗 GraphQL Endpoint:', graphqlMatch?.[1] || 'NOT FOUND');
  console.log('📡 Realtime Endpoint:', realtimeMatch?.[1] || 'NOT FOUND');
  console.log('👤 User Pool ID:', userPoolMatch?.[1] || 'NOT FOUND');
  console.log('🔑 Client ID:', clientIdMatch?.[1] || 'NOT FOUND');
  
} catch (error) {
  console.error('❌ Error checking AWS configuration:', error.message);
}

// 3. Verificar servicios críticos
console.log('\n3. CRITICAL SERVICES CHECK:');
console.log('----------------------------');

const criticalFiles = [
  'mobile/src/services/googleSignInService.ts',
  'mobile/src/services/federatedAuthService.ts',
  'mobile/src/services/voteService.ts',
  'mobile/src/services/appSyncService.ts',
  'mobile/src/services/cognitoAuthService.ts'
];

criticalFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`✅ ${file} (${Math.round(stats.size / 1024)}KB)`);
  } else {
    console.log(`❌ ${file} MISSING`);
  }
});

// 4. Problemas identificados y soluciones
console.log('\n4. PROBLEMAS IDENTIFICADOS:');
console.log('----------------------------');

console.log(`
🚨 PROBLEMA 1: Google Sign-In Configuration Error
   - El APK compilado no puede acceder a Google Sign-In
   - Posibles causas:
     * SHA-1 fingerprint no configurado en Google Console
     * Client IDs no coinciden
     * google-services.json no incluido correctamente en build

🚨 PROBLEMA 2: Vote Registration Failing  
   - Los votos no se registran en el backend
   - Posibles causas:
     * AppSync authentication failing
     * GraphQL mutations not working
     * Network connectivity issues in APK

💡 SOLUCIONES PROPUESTAS:
   1. Configurar SHA-1 fingerprint para APK release
   2. Verificar Google Console OAuth configuration
   3. Implementar fallback authentication (email/password)
   4. Debug AppSync connectivity in APK
   5. Add comprehensive error logging
`);

console.log('\n✅ Diagnóstico completado');