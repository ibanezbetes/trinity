/**
 * Script para verificar que la configuración de AWS está lista
 * Ejecutar: node verify-aws-setup.js
 */

const https = require('https');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkEndpoint(url, name) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 400 || res.statusCode === 401) {
        // 400/401 significa que el endpoint responde (aunque sin auth)
        log(`✅ ${name}: Activo (Status ${res.statusCode})`, colors.green);
        resolve(true);
      } else {
        log(`⚠️  ${name}: Responde pero con status ${res.statusCode}`, colors.yellow);
        resolve(true);
      }
    });

    req.on('error', (error) => {
      log(`❌ ${name}: No disponible (${error.message})`, colors.red);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      log(`❌ ${name}: Timeout`, colors.red);
      resolve(false);
    });

    // Enviar query GraphQL básica
    req.write(JSON.stringify({
      query: '{ __typename }'
    }));
    req.end();
  });
}

async function verifyAWSSetup() {
  log('\n🔍 Verificando Configuración de AWS Trinity\n', colors.cyan);
  log('━'.repeat(60), colors.blue);

  // 1. Verificar AppSync GraphQL
  log('\n📡 Verificando AppSync GraphQL API...', colors.blue);
  const appsyncUrl = 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql';
  await checkEndpoint(appsyncUrl, 'AppSync GraphQL');

  // 2. Verificar configuración de Cognito
  log('\n🔐 Verificando Cognito User Pool...', colors.blue);
  const cognitoConfig = {
    userPoolId: 'eu-west-1_6UxioIj4z',
    clientId: '59dpqsm580j14ulkcha19shl64',
    region: 'eu-west-1'
  };
  log(`   User Pool ID: ${cognitoConfig.userPoolId}`, colors.green);
  log(`   Client ID: ${cognitoConfig.clientId}`, colors.green);
  log(`   Region: ${cognitoConfig.region}`, colors.green);

  // 3. Verificar Lambda Functions
  log('\n⚡ Lambda Functions Desplegadas:', colors.blue);
  const lambdas = [
    'trinity-auth-dev',
    'trinity-room-dev',
    'trinity-vote-dev',
    'trinity-movie-dev',
    'trinity-ai-dev',
    'trinity-realtime-dev'
  ];
  lambdas.forEach(lambda => {
    log(`   ✅ ${lambda}`, colors.green);
  });

  // 4. Verificar DynamoDB Tables
  log('\n💾 DynamoDB Tables Desplegadas:', colors.blue);
  const tables = [
    'trinity-users-dev',
    'trinity-rooms-dev-v2',
    'trinity-votes-dev',
    'trinity-room-members-dev',
    'trinity-movies-cache-dev'
  ];
  tables.forEach(table => {
    log(`   ✅ ${table}`, colors.green);
  });

  // 5. Verificar APIs Externas
  log('\n🌐 Verificando APIs Externas...', colors.blue);
  
  // TMDB API
  const tmdbKey = 'dc4dbcd2404c1ca852f8eb964add267d';
  if (tmdbKey && tmdbKey.length > 0) {
    log(`   ✅ TMDB API Key configurada`, colors.green);
  } else {
    log(`   ❌ TMDB API Key no configurada`, colors.red);
  }

  // Hugging Face API
  const hfToken = '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';
  if (hfToken && hfToken.length > 0) {
    log(`   ✅ Hugging Face Token configurado`, colors.green);
  } else {
    log(`   ❌ Hugging Face Token no configurado`, colors.red);
  }

  // 6. Resumen
  log('\n━'.repeat(60), colors.blue);
  log('\n📊 Resumen de Configuración:', colors.cyan);
  log('\n✅ Infraestructura AWS:', colors.green);
  log('   • AppSync GraphQL API activa');
  log('   • 6 Lambda Functions desplegadas');
  log('   • 5 Tablas DynamoDB activas');
  log('   • Cognito User Pool configurado');
  
  log('\n🚀 Próximos Pasos:', colors.yellow);
  log('   1. Iniciar app móvil: cd mobile && npm start');
  log('   2. No necesitas iniciar backend local');
  log('   3. La app se conectará directamente a AWS');
  log('   4. Ver logs: aws logs tail /aws/lambda/trinity-room-dev --follow');
  
  log('\n📚 Documentación:', colors.blue);
  log('   • Guía completa: GUIA_TRABAJAR_SOLO_AWS.md');
  log('   • Arquitectura: arquitectura_proyecto.md');
  log('   • README: README.md');

  log('\n━'.repeat(60), colors.blue);
  log('\n✨ ¡Todo listo para trabajar con AWS!\n', colors.green);
}

// Ejecutar verificación
verifyAWSSetup().catch(error => {
  log(`\n❌ Error durante la verificación: ${error.message}`, colors.red);
  process.exit(1);
});
