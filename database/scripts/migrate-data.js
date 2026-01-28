const { execSync } = require('child_process');

async function migrateData() {
    console.log('🔄 Iniciando migración y backup de datos...');
    
    // Tablas principales a respaldar
    const tables = [
        'trinity-users-dev',
        'trinity-rooms-dev-v2',
        'trinity-room-members-dev',
        'trinity-room-invites-dev-v2',
        'trinity-votes-dev',
        'trinity-movies-cache-dev',
        'trinity-room-matches-dev',
        'trinity-connections-dev'
    ];
    
    for (const table of tables) {
        try {
            console.log(`📦 Creando backup de ${table}...`);
            
            const backupName = `${table}-backup-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
            
            execSync(`aws dynamodb create-backup --table-name ${table} --backup-name ${backupName} --region eu-west-1`, { 
                stdio: 'inherit' 
            });
            
            console.log(`✅ Backup de ${table} creado: ${backupName}`);
            
        } catch (error) {
            if (error.message.includes('ResourceNotFoundException')) {
                console.log(`ℹ️  Tabla ${table} no existe, saltando...`);
            } else {
                console.error(`❌ Error creando backup de ${table}:`, error.message);
            }
        }
    }
    
    console.log('🎉 ¡Migración y backup completados!');
}

migrateData();