const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function cleanAllTestRooms() {
  console.log('🧹 CLEANING ALL TEST ROOMS\n');

  try {
    // 1. Obtener todas las salas
    console.log('1️⃣ Scanning all rooms...');
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev-v2',
      FilterExpression: 'attribute_exists(#name)',
      ExpressionAttributeNames: {
        '#name': 'name'
      }
    }));

    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log('✅ No rooms found to delete');
      return;
    }

    console.log(`📊 Found ${scanResult.Items.length} rooms to delete\n`);

    // 2. Mostrar las salas que se van a eliminar
    console.log('📋 Rooms to be deleted:');
    scanResult.Items.forEach((room, index) => {
      const createdAt = new Date(room.createdAt);
      console.log(`   ${index + 1}. ${room.name || 'Sin nombre'} (${room.id}) - ${createdAt.toLocaleString()}`);
    });
    console.log('');

    // 3. Eliminar todas las salas
    console.log('🗑️ Deleting rooms...');
    let deletedCount = 0;
    let errorCount = 0;

    for (const room of scanResult.Items) {
      try {
        await docClient.send(new DeleteCommand({
          TableName: 'trinity-rooms-dev-v2',
          Key: {
            PK: room.PK,
            SK: room.SK
          }
        }));
        
        console.log(`   ✅ Deleted: ${room.name || 'Sin nombre'} (${room.id})`);
        deletedCount++;
        
        // Pequeña pausa para no sobrecargar DynamoDB
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`   ❌ Failed to delete: ${room.name || 'Sin nombre'} (${room.id}) - ${error.message}`);
        errorCount++;
      }
    }

    console.log('');
    console.log('📊 CLEANUP SUMMARY:');
    console.log(`   ✅ Successfully deleted: ${deletedCount} rooms`);
    console.log(`   ❌ Failed to delete: ${errorCount} rooms`);
    console.log(`   📊 Total processed: ${deletedCount + errorCount} rooms`);

    if (deletedCount > 0) {
      console.log('');
      console.log('🎉 Room cleanup completed successfully!');
      console.log('   All test rooms have been removed from the database.');
      console.log('   You can now create fresh rooms for testing.');
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// También limpiar miembros de salas
async function cleanRoomMembers() {
  console.log('\n🧹 CLEANING ROOM MEMBERS\n');

  try {
    console.log('1️⃣ Scanning all room members...');
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-room-members-dev'
    }));

    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log('✅ No room members found to delete');
      return;
    }

    console.log(`📊 Found ${scanResult.Items.length} room member records to delete\n`);

    let deletedCount = 0;
    let errorCount = 0;

    for (const member of scanResult.Items) {
      try {
        await docClient.send(new DeleteCommand({
          TableName: 'trinity-room-members-dev',
          Key: {
            roomId: member.roomId,
            userId: member.userId
          }
        }));
        
        console.log(`   ✅ Deleted member: ${member.userId} from room ${member.roomId}`);
        deletedCount++;
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.log(`   ❌ Failed to delete member: ${member.userId} - ${error.message}`);
        errorCount++;
      }
    }

    console.log('');
    console.log('📊 MEMBER CLEANUP SUMMARY:');
    console.log(`   ✅ Successfully deleted: ${deletedCount} member records`);
    console.log(`   ❌ Failed to delete: ${errorCount} member records`);

  } catch (error) {
    console.error('❌ Error during member cleanup:', error);
  }
}

async function fullCleanup() {
  console.log('🚀 STARTING FULL DATABASE CLEANUP\n');
  
  await cleanAllTestRooms();
  await cleanRoomMembers();
  
  console.log('\n🎉 FULL CLEANUP COMPLETED!');
  console.log('   - All test rooms deleted');
  console.log('   - All room member records deleted');
  console.log('   - Database is now clean for fresh testing');
  console.log('');
  console.log('📱 Next steps:');
  console.log('   1. Create a new room from the mobile app');
  console.log('   2. Select specific genres (e.g., Action + Adventure)');
  console.log('   3. Verify that contentIds is populated with filtered movies');
}

fullCleanup().catch(console.error);
