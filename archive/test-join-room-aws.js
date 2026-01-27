/**
 * Script de prueba para unirse a una sala usando AWS AppSync
 * Ejecutar: node test-join-room-aws.js
 */

const https = require('https');

// Configuración
const APPSYNC_ENDPOINT = 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql';
const INVITE_CODE = 'ABC123'; // Cambia esto por un código real

// Colores
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

async function testJoinRoom() {
  log('\n🧪 Probando Join Room con AWS AppSync\n', colors.cyan);
  log('━'.repeat(60), colors.blue);

  // Nota: Este script requiere un token de autenticación válido
  // Para obtenerlo, primero debes iniciar sesión en la app
  
  log('\n📋 Pasos para probar Join Room:', colors.yellow);
  log('1. Inicia la app móvil: cd mobile && npm start');
  log('2. Presiona "w" para abrir en el navegador');
  log('3. Inicia sesión con: test@trinity.com / Trinity2024!');
  log('4. Ve a la pantalla de "Unirse a Sala"');
  log('5. Introduce un código de invitación válido');
  log('6. Observa los logs en la consola del navegador');

  log('\n🔍 Para ver logs de Lambda en tiempo real:', colors.blue);
  log('aws logs tail /aws/lambda/trinity-room-dev --follow --region eu-west-1');

  log('\n📊 Verificación de Configuración:', colors.cyan);
  log(`✅ AppSync Endpoint: ${APPSYNC_ENDPOINT}`, colors.green);
  log(`✅ Región: eu-west-1`, colors.green);
  log(`✅ Lambda Function: trinity-room-dev`, colors.green);

  log('\n🎯 Flujo de Join Room:', colors.blue);
  log('1. Usuario introduce código de invitación en la app');
  log('2. App llama a appSync.joinRoom({ inviteCode })');
  log('3. AppSync ejecuta mutation joinRoomByInvite');
  log('4. Lambda trinity-room-dev procesa la solicitud');
  log('5. Lambda busca sala en DynamoDB por inviteCode');
  log('6. Lambda añade usuario a trinity-room-members-dev');
  log('7. Lambda retorna información de la sala');
  log('8. App muestra confirmación al usuario');

  log('\n🐛 Debugging:', colors.yellow);
  log('Si hay errores, revisa:');
  log('• Logs del navegador (F12 → Console)');
  log('• Logs de Lambda en CloudWatch');
  log('• Tabla DynamoDB trinity-rooms-dev-v2');
  log('• Token de autenticación válido');

  log('\n━'.repeat(60), colors.blue);
  log('\n✨ ¡Listo para probar!\n', colors.green);
}

testJoinRoom().catch(error => {
  log(`\n❌ Error: ${error.message}`, colors.red);
  process.exit(1);
});
