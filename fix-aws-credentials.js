/**
 * Script para remover credenciales de AWS hardcodeadas de todos los archivos
 */

const fs = require('fs');
const path = require('path');

// Lista de archivos que contienen credenciales
const filesToFix = [
    'test-mobile-genre-loading.js',
    'test-mobile-config-update.js', 
    'test-final-configuration.js',
    'list-dynamodb-tables-and-delete.js',
    'investigate-table-schema.js',
    'deploy-lambda-fixed.js',
    'delete-rooms-correct-table.js',
    'debug-tmdb-in-lambda.js',
    'delete-all-test-rooms.js',
    'debug-lambda-detailed.js',
    'debug-filtering-issue.js'
];

// Patrón a buscar y reemplazar
const oldPattern = `AWS.config.update({ 
  region: 'eu-west-1',
  // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: 'wDwOkqCQeMRJ5ok6Iycn5HTXCsm1v+zQ1ZjKvJZS'
});`;

const newPattern = `AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials should be configured via environment variables or AWS CLI
  // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});`;

console.log('🔧 Fixing AWS credentials in files...');

filesToFix.forEach(filename => {
    if (fs.existsSync(filename)) {
        console.log(`📝 Processing ${filename}...`);
        
        let content = fs.readFileSync(filename, 'utf8');
        
        // Reemplazar las credenciales hardcodeadas
        content = content.replace(
            /AWS\.config\.update\(\{\s*\n\s*region:\s*'eu-west-1',\s*\n\s*accessKeyId:\s*'AKIA4KZ6MNNXEPEVX44C',\s*\n\s*secretAccessKey:\s*'wDwOkqCQeMRJ5ok6Iycn5HTXCsm1v+zQ1ZjKvJZS'\s*\n\s*\}\);/g,
            `AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials should be configured via environment variables or AWS CLI
  // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});`
        );
        
        fs.writeFileSync(filename, content, 'utf8');
        console.log(`✅ Fixed ${filename}`);
    } else {
        console.log(`⚠️ File not found: ${filename}`);
    }
});

console.log('🎉 All files processed!');
console.log('\n📋 Next steps:');
console.log('1. git add .');
console.log('2. git commit -m "security: remove hardcoded AWS credentials"');
console.log('3. git push origin main');
