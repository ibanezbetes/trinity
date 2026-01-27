#!/usr/bin/env node

/**
 * Script para monitorear pruebas de tiempo real
 * Muestra logs de AppSync y Lambda en tiempo real
 */

const { spawn } = require('child_process');

const API_ID = 'epjtt2y3fzh53ii6omzj6n6h5a';
const REGION = 'eu-west-1';

console.log('🔍 MONITOR DE PRUEBAS EN TIEMPO REAL');
console.log('=====================================\n');
console.log('Este script mostrará los logs de AppSync y Lambda en tiempo real.');
console.log('Úsalo mientras pruebas la app para ver qué está pasando.\n');
console.log('Presiona Ctrl+C para detener.\n');
console.log('=====================================\n');

// Función para formatear logs
function formatLog(source, data) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    if (line.includes('ERROR') || line.includes('Error')) {
      console.log(`[${timestamp}] ❌ ${source}: ${line}`);
    } else if (line.includes('SUCCESS') || line.includes('success')) {
      console.log(`[${timestamp}] ✅ ${source}: ${line}`);
    } else if (line.includes('VOTE') || line.includes('vote')) {
      console.log(`[${timestamp}] 🗳️  ${source}: ${line}`);
    } else if (line.includes('MATCH') || line.includes('match')) {
      console.log(`[${timestamp}] 🎉 ${source}: ${line}`);
    } else if (line.includes('SUBSCRIPTION') || line.includes('subscription')) {
      console.log(`[${timestamp}] 📡 ${source}: ${line}`);
    } else {
      console.log(`[${timestamp}] ℹ️  ${source}: ${line}`);
    }
  });
}

// Monitorear AppSync
console.log('📡 Iniciando monitor de AppSync...\n');
const appsyncProcess = spawn('aws', [
  'logs',
  'tail',
  `/aws/appsync/apis/${API_ID}`,
  '--follow',
  '--region',
  REGION,
  '--format',
  'short'
], { shell: true });

appsyncProcess.stdout.on('data', (data) => {
  formatLog('AppSync', data);
});

appsyncProcess.stderr.on('data', (data) => {
  const msg = data.toString();
  if (!msg.includes('Skipping event')) {
    console.error(`[AppSync Error]: ${msg}`);
  }
});

// Monitorear Lambda Vote
console.log('⚡ Iniciando monitor de Lambda (vote)...\n');
const lambdaProcess = spawn('aws', [
  'logs',
  'tail',
  '/aws/lambda/trinity-vote-dev',
  '--follow',
  '--region',
  REGION,
  '--format',
  'short'
], { shell: true });

lambdaProcess.stdout.on('data', (data) => {
  formatLog('Lambda', data);
});

lambdaProcess.stderr.on('data', (data) => {
  const msg = data.toString();
  if (!msg.includes('Skipping event')) {
    console.error(`[Lambda Error]: ${msg}`);
  }
});

// Manejo de errores
appsyncProcess.on('error', (error) => {
  console.error('❌ Error al iniciar monitor de AppSync:', error.message);
  console.error('   Verifica que AWS CLI esté instalado y configurado.');
});

lambdaProcess.on('error', (error) => {
  console.error('❌ Error al iniciar monitor de Lambda:', error.message);
  console.error('   Verifica que AWS CLI esté instalado y configurado.');
});

// Manejo de cierre
process.on('SIGINT', () => {
  console.log('\n\n🛑 Deteniendo monitores...');
  appsyncProcess.kill();
  lambdaProcess.kill();
  console.log('✅ Monitores detenidos.');
  process.exit(0);
});

console.log('=====================================');
console.log('✅ Monitores activos');
console.log('=====================================\n');
console.log('Ahora puedes probar la app y ver los logs aquí.\n');
console.log('Leyenda:');
console.log('  ✅ = Éxito');
console.log('  ❌ = Error');
console.log('  🗳️  = Voto');
console.log('  🎉 = Match');
console.log('  📡 = Subscription');
console.log('  ℹ️  = Info\n');
