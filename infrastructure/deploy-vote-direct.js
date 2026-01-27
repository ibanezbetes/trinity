const { execSync } = require('child_process');
const fs = require('fs');
const AdmZip = require('adm-zip');

console.log('📦 Desplegando Vote Handler actualizado...\n');

try {
    // 1. Crear ZIP con el handler compilado
    console.log('🔨 Creando paquete ZIP...');
    const zip = new AdmZip();

    // Agregar vote.js como vote.js (Lambda espera este nombre)
    zip.addLocalFile('dist/handlers/vote.js', '', 'vote.js');
    zip.writeZip('vote-deploy.zip');

    console.log('✅ ZIP creado: vote-deploy.zip');

    // 2. Desplegar a Lambda
    console.log('\n🚀 Desplegando a Lambda trinity-vote-dev...');

    try {
        execSync('aws lambda update-function-code --function-name trinity-vote-dev --zip-file fileb://vote-deploy.zip --region eu-west-1', { stdio: 'inherit' });
        console.log('\n✅ Vote Handler actualizado exitosamente!');
    } catch (error) {
        console.error('\n❌ Error desplegando Lambda:', error.message);
        console.log('\n⚠️ Si ves un error de credenciales, ejecuta:');
        console.log('   aws configure');
        console.log('   Y proporciona tu AWS Access Key ID y Secret Access Key');
    }

    // Limpieza
    if (fs.existsSync('vote-deploy.zip')) {
        fs.unlinkSync('vote-deploy.zip');
    }

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
