/**
 * Investigate the table schema to understand the key structure
 */


// Cargar variables de entorno si existe archivo .env
try {
    require('dotenv').config();
} catch (e) {
    // dotenv no está instalado, usar variables de entorno del sistema
}

const AWS = require('aws-sdk');

// AWS Configuration - Credenciales desde variables de entorno
AWS.config.update({ 
    region: process.env.AWS_DEFAULT_REGION || 'eu-west-1'
    // Las credenciales se cargan automáticamente desde:
    // 1. Variables de entorno: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
    // 2. Archivo ~/.aws/credentials
    // 3. Roles IAM (en producción)
});

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials should be configured via environment variables or AWS CLI
  // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

async function investigateTableSchema() {
  console.log('🔍 INVESTIGATING TABLE SCHEMA');
  console.log('═'.repeat(50));
  
  const roomsTable = 'trinity-rooms-dev-v2';
  
  try {
    // Step 1: Describe table to get key schema
    console.log(`\n1️⃣ Describing table: ${roomsTable}`);
    
    const tableDescription = await dynamodb.describeTable({
      TableName: roomsTable
    }).promise();
    
    const keySchema = tableDescription.Table.KeySchema;
    const attributeDefinitions = tableDescription.Table.AttributeDefinitions;
    
    console.log('\n   Key Schema:');
    keySchema.forEach(key => {
      const attr = attributeDefinitions.find(a => a.AttributeName === key.AttributeName);
      console.log(`   - ${key.AttributeName} (${key.KeyType}): ${attr.AttributeType}`);
    });
    
    // Step 2: Get a sample item to see the actual structure
    console.log('\n2️⃣ Getting sample items...');
    
    const scanResult = await docClient.scan({
      TableName: roomsTable,
      Limit: 3
    }).promise();
    
    const items = scanResult.Items || [];
    
    if (items.length > 0) {
      console.log('\n   Sample item structure:');
      const sampleItem = items[0];
      Object.keys(sampleItem).forEach(key => {
        const value = sampleItem[key];
        const type = typeof value;
        const preview = type === 'string' ? value.substring(0, 50) : JSON.stringify(value);
        console.log(`   - ${key}: ${type} = ${preview}`);
      });
      
      // Step 3: Try to delete using the correct key structure
      console.log('\n3️⃣ Attempting deletion with correct key...');
      
      // Extract the key based on the schema
      const deleteKey = {};
      keySchema.forEach(keyDef => {
        const keyName = keyDef.AttributeName;
        if (sampleItem[keyName] !== undefined) {
          deleteKey[keyName] = sampleItem[keyName];
        }
      });
      
      console.log('   Delete key:', JSON.stringify(deleteKey, null, 2));
      
      try {
        await docClient.delete({
          TableName: roomsTable,
          Key: deleteKey
        }).promise();
        
        console.log('   ✅ Test deletion successful!');
        
        // Now delete all rooms with the correct key structure
        console.log('\n4️⃣ Deleting all rooms with correct key structure...');
        
        const allRooms = await docClient.scan({
          TableName: roomsTable
        }).promise();
        
        let deletedCount = 0;
        
        for (const room of allRooms.Items) {
          const roomDeleteKey = {};
          keySchema.forEach(keyDef => {
            const keyName = keyDef.AttributeName;
            if (room[keyName] !== undefined) {
              roomDeleteKey[keyName] = room[keyName];
            }
          });
          
          try {
            await docClient.delete({
              TableName: roomsTable,
              Key: roomDeleteKey
            }).promise();
            
            deletedCount++;
            
            if (deletedCount % 5 === 0) {
              console.log(`   ✅ Deleted ${deletedCount}/${allRooms.Items.length} rooms`);
            }
            
          } catch (deleteError) {
            console.error(`   ❌ Error deleting room: ${deleteError.message}`);
          }
          
          // Small delay
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        console.log(`\n   🎉 Successfully deleted ${deletedCount}/${allRooms.Items.length} rooms!`);
        
      } catch (testDeleteError) {
        console.error('   ❌ Test deletion failed:', testDeleteError.message);
      }
      
    } else {
      console.log('   ❌ No items found in table');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the investigation
investigateTableSchema().catch(console.error);
