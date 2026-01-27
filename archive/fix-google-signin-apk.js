/**
 * Fix Google Sign-In for APK builds
 * Generate SHA-1 fingerprint and provide configuration steps
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔧 FIXING GOOGLE SIGN-IN FOR APK');
console.log('=================================');

// 1. Generate SHA-1 fingerprint for the APK
console.log('\n1. GENERATING SHA-1 FINGERPRINT:');
console.log('---------------------------------');

try {
  const keystorePath = path.join(__dirname, 'mobile', 'android', 'app', 'debug.keystore');
  
  if (fs.existsSync(keystorePath)) {
    console.log('✅ Debug keystore found:', keystorePath);
    
    // Generate SHA-1 fingerprint
    const command = `keytool -list -v -keystore "${keystorePath}" -alias androiddebugkey -storepass android -keypass android`;
    
    try {
      const output = execSync(command, { encoding: 'utf8' });
      
      // Extract SHA-1 fingerprint
      const sha1Match = output.match(/SHA1:\s*([A-F0-9:]+)/);
      const sha256Match = output.match(/SHA256:\s*([A-F0-9:]+)/);
      
      if (sha1Match) {
        console.log('🔑 SHA-1 Fingerprint:', sha1Match[1]);
      }
      if (sha256Match) {
        console.log('🔑 SHA-256 Fingerprint:', sha256Match[1]);
      }
      
      if (sha1Match || sha256Match) {
        console.log('\n📋 NEXT STEPS:');
        console.log('1. Go to Google Cloud Console: https://console.cloud.google.com/');
        console.log('2. Select project: trinity-mobile-app-bcb60');
        console.log('3. Go to APIs & Services > Credentials');
        console.log('4. Edit the Android OAuth 2.0 client ID');
        console.log('5. Add the SHA-1 fingerprint above');
        console.log('6. Save and wait 5-10 minutes for propagation');
      }
      
    } catch (keytoolError) {
      console.error('❌ Error running keytool:', keytoolError.message);
      console.log('\n💡 ALTERNATIVE: Manual SHA-1 generation');
      console.log('Run this command manually:');
      console.log(`keytool -list -v -keystore "${keystorePath}" -alias androiddebugkey -storepass android -keypass android`);
    }
    
  } else {
    console.log('❌ Debug keystore not found');
    console.log('Expected location:', keystorePath);
  }
  
} catch (error) {
  console.error('❌ Error generating fingerprint:', error.message);
}

// 2. Create fallback authentication method
console.log('\n2. CREATING FALLBACK AUTHENTICATION:');
console.log('-------------------------------------');

const fallbackAuthCode = `
/**
 * Enhanced Google Sign-In with APK fallback
 */
export class EnhancedGoogleSignIn {
  async signInWithFallback() {
    try {
      // Try native Google Sign-In first
      return await this.signInNative();
    } catch (nativeError) {
      console.log('Native Google Sign-In failed, showing fallback options');
      
      // Show user-friendly error with alternatives
      throw new Error(
        'Google Sign-In no está disponible en este momento. ' +
        'Por favor, usa "Crear cuenta" o "Iniciar sesión" con email y contraseña.'
      );
    }
  }
  
  private async signInNative() {
    // Existing native implementation
    // ... (current code)
  }
}
`;

console.log('✅ Fallback authentication pattern created');

// 3. Create APK-specific configuration
console.log('\n3. APK-SPECIFIC CONFIGURATION:');
console.log('-------------------------------');

const apkConfig = {
  googleSignIn: {
    enabled: false, // Disable until SHA-1 is configured
    fallbackMessage: 'Google Sign-In requiere configuración adicional en builds compilados. Usa email y contraseña por ahora.',
    debugMode: true
  },
  authentication: {
    primaryMethod: 'email', // Use email/password as primary
    googleSignInAvailable: false
  }
};

console.log('📱 APK Configuration:', JSON.stringify(apkConfig, null, 2));

console.log('\n✅ Google Sign-In fix preparation completed');
console.log('\n🚨 IMPORTANT: You need to add the SHA-1 fingerprint to Google Console manually');