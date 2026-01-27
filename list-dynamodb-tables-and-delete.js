/**
 * List DynamoDB tables and delete all rooms from the correct table
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials are loaded from environment variables or AWS CLI
});

const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

async function listTablesAndDeleteRooms() {
  console.log('🔍 FINDING ROOMS TABLE AND DELETING ALL ROOMS');
  console.log('═'.repeat(60));
  
  try {
    // Step 1: List all tables
    console.log('\n1️⃣ Listing all DynamoDB tables...');
    
    const tablesResult = await dynamodb.listTables().promise();
    const tables = tablesResult.TableNames || [];
    
    console.log(`   Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`   - ${table}`);
    });
    
    // Step 2: Find rooms table
    const roomsTable = tables.find(table => 
      table.toLowerCase().includes('room') && 
      !table.toLowerCase().includes('cache')
    );
    
    if (!roomsTable) {
      console.log('\n❌ No rooms table found');
      return;
    }
    
    console.log(`\n2️⃣ Using rooms table: ${roomsTable}`);
    
    // Step 3: Scan and delete all rooms
    console.log('\n3️⃣ Scanning for all rooms...');
    
    const scanResult = await docClient.scan({
      TableName: roomsTable
    }).promise();
    
    const rooms = scanResult.Items || [];
    console.log(`   Found ${rooms.length} rooms to delete`);
    
    if (rooms.length === 0) {
      console.log('   ✅ No rooms found to delete');
      return;
    }
    
    // Show first few rooms
    console.log('\n   Sample rooms:');
    rooms.slice(0, 5).forEach(room => {
      console.log(`   - ${room.name || 'Unnamed'} (${room.id})`);
    });
    if (rooms.length > 5) {
      console.log(`   ... and ${rooms.length - 5} more`);
    }
    
    // Step 4: Delete all rooms in batches
    console.log('\n4️⃣ Deleting rooms in batches...');
    
    const batchSize = 25; // DynamoDB batch limit
    let deletedCount = 0;
    
    for (let i = 0; i < rooms.length; i += batchSize) {
      const batch = rooms.slice(i, i + batchSize);
      
      const deleteRequests = batch.map(room => ({
        DeleteRequest: {
          Key: { id: room.id }
        }
      }));
      
      try {
        await docClient.batchWrite({
          RequestItems: {
            [roomsTable]: deleteRequests
          }
        }).promise();
        
        deletedCount += batch.length;
        console.log(`   ✅ Deleted batch ${Math.ceil((i + 1) / batchSize)}: ${batch.length} rooms`);
        
        // Show some room names being deleted
        batch.slice(0, 2).forEach(room => {
          console.log(`      - ${room.name || 'Unnamed'} (${room.id.substring(0, 8)}...)`);
        });
        if (batch.length > 2) {
          console.log(`      ... and ${batch.length - 2} more`);
        }
        
      } catch (batchError) {
        console.error(`   ❌ Error deleting batch: ${batchError.message}`);
      }
      
      // Small delay between batches
      if (i + batchSize < rooms.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log(`✅ DELETION COMPLETE`);
    console.log(`   Total rooms deleted: ${deletedCount}/${rooms.length}`);
    
    if (deletedCount < rooms.length) {
      console.log(`   ⚠️ Some rooms may not have been deleted due to errors`);
    } else {
      console.log(`   🎉 All test rooms successfully deleted!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the process
listTablesAndDeleteRooms().catch(console.error);
