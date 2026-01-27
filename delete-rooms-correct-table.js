/**
 * Delete all rooms from the correct rooms table
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials are loaded from environment variables or AWS CLI
});

const docClient = new AWS.DynamoDB.DocumentClient();

async function deleteRoomsFromCorrectTable() {
  console.log('🗑️ DELETING ALL ROOMS FROM CORRECT TABLE');
  console.log('═'.repeat(50));
  
  // The correct table is trinity-rooms-dev-v2 based on the table list
  const roomsTable = 'trinity-rooms-dev-v2';
  
  try {
    console.log(`\n1️⃣ Using rooms table: ${roomsTable}`);
    
    // Step 1: Scan for all rooms
    console.log('\n2️⃣ Scanning for all rooms...');
    
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
    
    // Step 2: Delete all rooms one by one (safer than batch)
    console.log('\n3️⃣ Deleting rooms individually...');
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      
      try {
        await docClient.delete({
          TableName: roomsTable,
          Key: { id: room.id }
        }).promise();
        
        deletedCount++;
        
        if (i % 10 === 0 || i === rooms.length - 1) {
          console.log(`   ✅ Progress: ${deletedCount}/${rooms.length} deleted`);
        }
        
      } catch (deleteError) {
        errorCount++;
        console.error(`   ❌ Error deleting room ${room.id}: ${deleteError.message}`);
      }
      
      // Small delay to avoid throttling
      if (i < rooms.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log('\n' + '═'.repeat(50));
    console.log(`✅ DELETION COMPLETE`);
    console.log(`   Total rooms deleted: ${deletedCount}/${rooms.length}`);
    console.log(`   Errors: ${errorCount}`);
    
    if (deletedCount === rooms.length) {
      console.log(`   🎉 All test rooms successfully deleted!`);
    } else if (deletedCount > 0) {
      console.log(`   ⚠️ Some rooms deleted, but ${rooms.length - deletedCount} remain`);
    } else {
      console.log(`   ❌ No rooms were deleted`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the deletion
deleteRoomsFromCorrectTable().catch(console.error);
