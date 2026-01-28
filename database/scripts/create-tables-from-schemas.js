const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

async function createTablesFromSchemas() {
    console.log('🗄️  Creando tablas desde esquemas...');
    
    const schemasDir = 'database/schemas';
    const schemaFiles = fs.readdirSync(schemasDir).filter(file => file.endsWith('.json'));
    
    for (const schemaFile of schemaFiles) {
        try {
            const schemaPath = path.join(schemasDir, schemaFile);
            const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
            
            console.log(`📋 Procesando esquema: ${schema.tableName}`);
            
            // Crear comando de creación de tabla
            const createTableCommand = {
                TableName: schema.tableName,
                KeySchema: schema.keySchema,
                AttributeDefinitions: schema.attributeDefinitions,
                BillingMode: schema.billingMode || 'PAY_PER_REQUEST'
            };
            
            if (schema.globalSecondaryIndexes && schema.globalSecondaryIndexes.length > 0) {
                createTableCommand.GlobalSecondaryIndexes = schema.globalSecondaryIndexes;
            }
            
            if (schema.localSecondaryIndexes && schema.localSecondaryIndexes.length > 0) {
                createTableCommand.LocalSecondaryIndexes = schema.localSecondaryIndexes;
            }
            
            // Guardar comando como archivo JSON
            const commandFile = `database/scripts/create-${schema.tableName}.json`;
            fs.writeFileSync(commandFile, JSON.stringify(createTableCommand, null, 2));
            
            console.log(`✅ Comando de creación guardado: ${commandFile}`);
            
        } catch (error) {
            console.error(`❌ Error procesando ${schemaFile}:`, error.message);
        }
    }
    
    console.log('\n🎉 Scripts de creación de tablas generados');
    console.log('Para crear las tablas ejecuta:');
    console.log('aws dynamodb create-table --cli-input-json file://database/scripts/create-[table-name].json --region eu-west-1');
}

createTablesFromSchemas();