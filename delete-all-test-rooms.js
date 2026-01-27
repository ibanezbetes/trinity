/**
 * Delete all test rooms from the database
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials are loaded from environment variables or AWS CLI
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

async function deleteAllTestRooms() {
  console.log('🗑️ DELETING ALL TEST ROOMS');
  console.log('═'.repeat(50));
  
  try {
    // Step 1: Get all rooms
    console.log('\n1️⃣ Scanning for all rooms...');
    
    const scanResult = await dynamodb.scan({
      TableName: 'trinity-rooms-dev'
    }).promise();
    
    const rooms = scanResult.Items || [];
    console.log(`   Found ${rooms.length} rooms to delete`);
    
    if (rooms.length === 0) {
      console.log('   ✅ No rooms found to delete');
      return;
    }
    
    // Step 2: Delete all rooms in batches
    console.log('\n2️⃣ Deleting rooms in batches...');
    
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
        await dynamodb.batchWrite({
          RequestItems: {
            'trinity-rooms-dev': deleteRequests
          }
        }).promise();
        
        deletedCount += batch.length;
        console.log(`   ✅ Deleted batch ${Math.ceil((i + 1) / batchSize)}: ${batch.length} rooms`);
        
        // Show some room names being deleted
        batch.slice(0, 3).forEach(room => {
          console.log(`      - ${room.name} (${room.id})`);
        });
        if (batch.length > 3) {
          console.log(`      ... and ${batch.length - 3} more`);
        }
        
      } catch (batchError) {
        console.error(`   ❌ Error deleting batch: ${batchError.message}`);
      }
      
      // Small delay between batches
      if (i + batchSize < rooms.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('\n' + '═'.repeat(50));
    console.log(`✅ DELETION COMPLETE`);
    console.log(`   Total rooms deleted: ${deletedCount}/${rooms.length}`);
    
    if (deletedCount < rooms.length) {
      console.log(`   ⚠️ Some rooms may not have been deleted due to errors`);
    }
    
  } catch (error) {
    console.error('❌ Error deleting rooms:', error.message);
  }
}

// Run the deletion
deleteAllTestRooms().catch(console.error);
