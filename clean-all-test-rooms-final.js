/**
 * Clean All Test Rooms - Final Cleanup
 * 
 * Deletes all test rooms to start fresh
 */

const AWS = require('aws-sdk');

// AWS Configuration
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' });

async function cleanAllTestRooms() {
  try {
    console.log('🧹 Cleaning all test rooms...');
    console.log('');

    // Get all rooms
    const scanParams = {
      TableName: 'trinity-rooms-dev'
    };

    const result = await dynamodb.scan(scanParams).promise();
    const rooms = result.Items || [];

    console.log(`Found ${rooms.length} rooms to delete`);
    console.log('');

    if (rooms.length === 0) {
      console.log('✅ No rooms to delete');
      return;
    }

    // Delete all rooms
    for (const room of rooms) {
      try {
        console.log(`🗑️ Deleting room: ${room.name} (${room.id})`);
        
        await dynamodb.delete({
          TableName: 'trinity-rooms-dev',
          Key: { id: room.id }
        }).promise();
        
        console.log(`✅ Deleted: ${room.name}`);
      } catch (error) {
        console.error(`❌ Error deleting room ${room.id}:`, error.message);
      }
    }

    console.log('');
    console.log(`✅ Cleanup completed! Deleted ${rooms.length} rooms`);
    console.log('');
    console.log('🎯 Now you can create a fresh room to test the filtering');

  } catch (error) {
    console.error('❌ Error cleaning test rooms:', error);
    throw error;
  }
}

// Run the cleanup
if (require.main === module) {
  cleanAllTestRooms()
    .then(() => {
      console.log('🎉 Cleanup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanAllTestRooms };
