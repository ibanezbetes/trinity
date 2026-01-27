const { DynamoDBClient, DescribeTableCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function migrateRoomsSafely() {
  console.log('🔄 MIGRACIÓN SEGURA DE ROOMS\n');

  try {
    // 1. Verificar que ambas tablas existen
    console.log('1️⃣ Verificando tablas...');
    await client.send(new DescribeTableCommand({ TableName: 'trinity-rooms-dev' }));
    await client.send(new DescribeTableCommand({ TableName: 'trinity-rooms-dev-v2' }));
    console.log('✅ Ambas tablas existen\n');

    // 2. Obtener datos de la tabla antigua
    console.log('2️⃣ Obteniendo datos de trinity-rooms-dev...');
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev'
    }));
    
    console.log(`📊 Encontradas ${scanResult.Items.length} rooms para migrar\n`);

    if (scanResult.Items.length === 0) {
      console.log('✅ No hay datos para migrar');
      return;
    }

    // 3. Mostrar datos que se van a migrar
    console.log('3️⃣ Datos a migrar:');
    scanResult.Items.forEach((item, index) => {
      console.log(`   ${index + 1}. ID: ${item.id}`);
      console.log(`      Nombre: ${item.name || 'Sin nombre'}`);
      console.log(`      Host: ${item.hostId || 'N/A'}`);
      console.log(`      Creada: ${item.createdAt}`);
      console.log('');
    });

    // 4. Verificar si ya existen en la tabla v2
    console.log('4️⃣ Verificando duplicados en trinity-rooms-dev-v2...');
    let duplicates = 0;
    let newItems = 0;

    for (const item of scanResult.Items) {
      try {
        const existingItem = await docClient.send(new GetCommand({
          TableName: 'trinity-rooms-dev-v2',
          Key: { PK: `ROOM#${item.id}`, SK: 'ROOM' }
        }));

        if (existingItem.Item) {
          duplicates++;
          console.log(`   ⚠️  Ya existe: ${item.id}`);
        } else {
          newItems++;
        }
      } catch (error) {
        newItems++;
      }
    }

    console.log(`📊 Resumen: ${newItems} nuevos, ${duplicates} duplicados\n`);

    // 5. Migrar solo los nuevos
    if (newItems > 0) {
      console.log('5️⃣ Migrando datos nuevos...');
      let migratedCount = 0;
      let errorCount = 0;

      for (const item of scanResult.Items) {
        try {
          // Verificar si ya existe
          const existingCheck = await docClient.send(new GetCommand({
            TableName: 'trinity-rooms-dev-v2',
            Key: { PK: `ROOM#${item.id}`, SK: 'ROOM' }
          }));

          if (existingCheck.Item) {
            console.log(`   ⏭️  Saltando duplicado: ${item.id}`);
            continue;
          }

          // Adaptar estructura para v2
          const migratedItem = {
            PK: `ROOM#${item.id}`,
            SK: 'ROOM',
            id: item.id,
            name: item.name,
            hostId: item.hostId,
            createdAt: item.createdAt,
            status: item.status || 'active',
            inviteCode: item.inviteCode,
            // Copiar todos los demás campos
            ...item
          };

          // Eliminar campos que podrían causar conflicto
          delete migratedItem.PK;
          delete migratedItem.SK;
          
          // Recrear PK/SK
          migratedItem.PK = `ROOM#${item.id}`;
          migratedItem.SK = 'ROOM';

          await docClient.send(new PutCommand({
            TableName: 'trinity-rooms-dev-v2',
            Item: migratedItem,
            ConditionExpression: 'attribute_not_exists(PK)'
          }));

          migratedCount++;
          console.log(`   ✅ Migrada: ${item.id}`);

        } catch (error) {
          errorCount++;
          console.log(`   ❌ Error migrando ${item.id}: ${error.message}`);
        }
      }

      console.log(`\n📊 RESULTADO DE MIGRACIÓN:`);
      console.log(`   ✅ Migradas: ${migratedCount}`);
      console.log(`   ❌ Errores: ${errorCount}`);
      console.log(`   ⏭️  Duplicados saltados: ${duplicates}`);

      if (errorCount === 0) {
        console.log('\n✅ Migración completada exitosamente');
        
        // 6. Verificar migración
        console.log('\n6️⃣ Verificando migración...');
        await verifyMigration(scanResult.Items);
        
        console.log('\n🎯 PRÓXIMOS PASOS:');
        console.log('1. Verificar que la aplicación funciona correctamente');
        console.log('2. Actualizar código legacy para usar trinity-rooms-dev-v2');
        console.log('3. Eliminar trinity-rooms-dev cuando esté seguro');
        console.log('\nPara eliminar la tabla antigua:');
        console.log('node migrate-rooms-safely.js --delete-old');
        
      } else {
        console.log('\n⚠️  Hay errores en la migración. Revisar antes de continuar.');
      }
    } else {
      console.log('✅ Todos los datos ya están migrados');
    }

  } catch (error) {
    console.error('❌ Error en migración:', error.message);
  }
}

async function verifyMigration(originalItems) {
  console.log('🔍 Verificando que todos los datos se migraron correctamente...');
  
  let verified = 0;
  let missing = 0;

  for (const originalItem of originalItems) {
    try {
      const migratedItem = await docClient.send(new GetCommand({
        TableName: 'trinity-rooms-dev-v2',
        Key: { PK: `ROOM#${originalItem.id}`, SK: 'ROOM' }
      }));

      if (migratedItem.Item) {
        verified++;
        console.log(`   ✅ Verificada: ${originalItem.id}`);
      } else {
        missing++;
        console.log(`   ❌ Falta: ${originalItem.id}`);
      }
    } catch (error) {
      missing++;
      console.log(`   ❌ Error verificando ${originalItem.id}: ${error.message}`);
    }
  }

  console.log(`\n📊 VERIFICACIÓN: ${verified} verificadas, ${missing} faltantes`);
  return missing === 0;
}

async function deleteOldTable() {
  console.log('🗑️  ELIMINANDO TABLA ANTIGUA\n');
  
  try {
    // Verificar que la migración fue exitosa primero
    console.log('1️⃣ Verificando migración antes de eliminar...');
    
    const oldData = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev'
    }));

    const migrationVerified = await verifyMigration(oldData.Items);
    
    if (!migrationVerified) {
      console.log('❌ La migración no está completa. No se eliminará la tabla antigua.');
      return;
    }

    console.log('✅ Migración verificada. Procediendo a eliminar tabla antigua...\n');

    // Eliminar tabla
    await client.send(new DeleteTableCommand({
      TableName: 'trinity-rooms-dev'
    }));

    console.log('✅ Tabla trinity-rooms-dev eliminada exitosamente');
    console.log('\n🎉 OPTIMIZACIÓN COMPLETADA');
    console.log('Ahora solo tienes trinity-rooms-dev-v2 como tabla principal de rooms');

  } catch (error) {
    console.error('❌ Error eliminando tabla:', error.message);
  }
}

// Ejecutar según argumentos
const args = process.argv.slice(2);

if (args.includes('--delete-old')) {
  deleteOldTable();
} else {
  migrateRoomsSafely();
}
