#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🧪 Probando función Lambda trinity-room-dev (método binario)...\n');

// Crear evento de prueba
const testEvent = {
  info: {
    fieldName: 'createRoomSimple'
  },
  arguments: {
    name: `Sala Test ${new Date().toLocaleTimeString()}`
  },
  identity: {
    sub: '5265d484-b0e1-7030-0b93-bf05d339a2b0' // Usuario test@trinity.app
  }
};

console.log('📝 Evento de prueba:');
console.log(JSON.stringify(testEvent, null, 2));

try {
  // Escribir evento a archivo temporal (sin formato)
  fs.writeFileSync('test-event.json', JSON.stringify(testEvent));
  console.log('\n📤 Invocando Lambda con fileb://...');
  
  // Invocar Lambda usando fileb:// para binary
  const result = execSync(
    'aws lambda invoke --function-name trinity-room-dev --region eu-west-1 --payload fileb://test-event.json response.json',
    { encoding: 'utf-8' }
  );
  
  console.log('\n📊 Resultado de invocación:');
  console.log(result);
  
  // Leer respuesta
  if (fs.existsSync('response.json')) {
    const response = fs.readFileSync('response.json', 'utf-8');
    console.log('\n📋 Respuesta de Lambda:');
    console.log(response);
    
    try {
      const parsedResponse = JSON.parse(response);
      
      if (parsedResponse.errorMessage) {
        console.log('\n❌ Error en Lambda:');
        console.log(parsedResponse.errorMessage);
        console.log('\n🔍 Stack trace:');
        if (parsedResponse.trace) {
          parsedResponse.trace.forEach(line => console.log(`   ${line}`));
        }
      } else {
        console.log('\n✅ ¡Lambda ejecutada exitosamente!');
        if (parsedResponse.id) {
          console.log(`   ID de sala: ${parsedResponse.id}`);
          console.log(`   Nombre: ${parsedResponse.name}`);
          console.log(`   Código de invitación: ${parsedResponse.inviteCode}`);
          console.log(`   Host ID: ${parsedResponse.hostId}`);
          console.log(`   Estado: ${parsedResponse.status}`);
        }
      }
    } catch (parseError) {
      console.log('\n⚠️ Respuesta no es JSON válido, mostrando raw:');
      console.log(response);
    }
  } else {
    console.log('\n❌ No se generó archivo de respuesta');
  }
  
} catch (error) {
  console.error('\n❌ Error ejecutando test:', error.message);
  
  // Intentar leer logs de CloudWatch para más detalles
  console.log('\n🔍 Revisando logs recientes de CloudWatch...');
  try {
    const logs = execSync(
      'aws logs tail /aws/lambda/trinity-room-dev --region eu-west-1 --since 2m',
      { encoding: 'utf-8' }
    );
    console.log('\n📋 Logs recientes:');
    console.log(logs);
  } catch (logError) {
    console.log('⚠️ No se pudieron obtener logs');
  }
  
} finally {
  // Limpiar archivos temporales
  try {
    if (fs.existsSync('test-event.json')) fs.unlinkSync('test-event.json');
    if (fs.existsSync('response.json')) fs.unlinkSync('response.json');
  } catch (e) {}
}