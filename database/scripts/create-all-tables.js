const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function createAllTables() {
    console.log('🗄️  Creando todas las tablas DynamoDB...');
    
    const schemaFiles = [
        'create-trinity-users-dev.json',
        'create-trinity-rooms-dev-v2.json',
        'create-trinity-room-members-dev.json',
        'create-trinity-room-invites-dev-v2.json',
        'create-trinity-votes-dev.json',
        'create-trinity-movies-cache-dev.json',
        'create-trinity-room-matches-dev.json',
        'create-trinity-connections-dev.json',
        'create-trinity-chat-sessions-dev.json'
    ];
    
    for (const schemaFile of schemaFiles) {
        try {
            const schemaPath = path.join(__dirname, schemaFile);
            
            if (fs.existsSync(schemaPath)) {
                console.log(`📋 Creando tabla desde: ${schemaFile}`);
                
                execSync(`aws dynamodb create-table --cli-input-json file://${schemaPath} --region eu-west-1`, { 
                    stdio: 'inherit' 
                });
                
                console.log(`✅ Tabla creada exitosamente`);
                
                // Configurar TTL si existe el archivo de configuración
                const ttlConfigFile = schemaFile.replace('create-', 'configure-ttl-');
                const ttlConfigPath = path.join(__dirname, ttlConfigFile);
                
                if (fs.existsSync(ttlConfigPath)) {
                    console.log(`⏰ Configurando TTL para la tabla...`);
                    
                    try {
                        execSync(`aws dynamodb update-time-to-live --cli-input-json file://${ttlConfigPath} --region eu-west-1`, { 
                            stdio: 'inherit' 
                        });
                        console.log(`✅ TTL configurado exitosamente`);
                    } catch (ttlError) {
                        console.log(`⚠️  Error configurando TTL (puede ser normal si ya está configurado):`, ttlError.message);
                    }
                }
                
                // Esperar un poco entre creaciones
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } else {
                console.log(`⚠️  Esquema no encontrado: ${schemaFile}`);
            }
            
        } catch (error) {
            if (error.message.includes('ResourceInUseException')) {
                console.log(`ℹ️  Tabla ya existe, continuando...`);
            } else {
                console.error(`❌ Error creando tabla desde ${schemaFile}:`, error.message);
            }
        }
    }
    
    console.log('🎉 ¡Proceso de creación de tablas completado!');
}

createAllTables();