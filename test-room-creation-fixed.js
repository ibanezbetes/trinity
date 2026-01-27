// Test to verify that room creation now works with the fixed ContentFilterService
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function testRoomCreationFixed() {
  console.log('🧪 TESTING ROOM CREATION WITH FIXED CONTENT FILTERING\n');

  console.log('📋 Instructions for manual testing:');
  console.log('1. Open the Trinity mobile app');
  console.log('2. Create a new room with specific genres (e.g., Action + Adventure)');
  console.log('3. Check if contentIds is populated (not null)');
  console.log('4. Verify that genreNames are mapped correctly');
  console.log('');

  console.log('🔍 Checking recent rooms in database...');
  
  try {
    // Get the most recent rooms
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev-v2',
      Limit: 5,
      FilterExpression: 'attribute_exists(#name)',
      ExpressionAttributeNames: {
        '#name': 'name'
      }
    }));

    if (scanResult.Items.length === 0) {
      console.log('❌ No rooms found in database');
      return;
    }

    console.log(`📊 Found ${scanResult.Items.length} recent rooms:\n`);

    // Sort by creation date (most recent first)
    const sortedRooms = scanResult.Items.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    for (let i = 0; i < sortedRooms.length; i++) {
      const room = sortedRooms[i];
      const createdAt = new Date(room.createdAt);
      const isRecent = (Date.now() - createdAt.getTime()) < (60 * 60 * 1000); // Within last hour
      
      console.log(`🏠 ROOM ${i + 1}: ${room.name || 'Sin nombre'} ${isRecent ? '🆕' : ''}`);
      console.log(`   ID: ${room.id || room.roomId}`);
      console.log(`   Created: ${createdAt.toLocaleString()}`);
      console.log(`   Age: ${Math.round((Date.now() - createdAt.getTime()) / (1000 * 60))} minutes ago`);
      console.log('');
      
      console.log('   📋 FILTERING STATUS:');
      console.log(`   mediaType: ${room.mediaType || 'null'}`);
      console.log(`   genreIds: ${room.genreIds ? JSON.stringify(room.genreIds) : 'null'}`);
      console.log(`   genreNames: ${room.genreNames ? JSON.stringify(room.genreNames) : 'null'}`);
      
      const hasContentIds = room.contentIds && room.contentIds.length > 0;
      console.log(`   contentIds: ${hasContentIds ? `✅ [${room.contentIds.length} items]` : '❌ null/empty'}`);
      console.log(`   filterCriteria: ${room.filterCriteria ? '✅ SET' : '❌ null'}`);
      console.log(`   lastContentRefresh: ${room.lastContentRefresh || 'null'}`);
      
      // Determine filtering status
      if (room.mediaType && room.genreIds && room.genreIds.length > 0) {
        if (hasContentIds) {
          console.log(`   🎉 STATUS: ✅ ADVANCED FILTERING WORKING!`);
        } else {
          console.log(`   ⚠️  STATUS: ❌ Advanced filtering configured but no content loaded`);
        }
      } else if (room.genrePreferences && room.genrePreferences.length > 0) {
        console.log(`   📜 STATUS: Using legacy filtering system`);
      } else {
        console.log(`   🔄 STATUS: No filtering configured`);
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
    }

    // Summary
    const recentRooms = sortedRooms.filter(room => {
      const createdAt = new Date(room.createdAt);
      return (Date.now() - createdAt.getTime()) < (60 * 60 * 1000); // Within last hour
    });

    const workingRooms = recentRooms.filter(room => 
      room.mediaType && room.genreIds && room.contentIds && room.contentIds.length > 0
    );

    console.log('📊 SUMMARY:');
    console.log(`   Recent rooms (last hour): ${recentRooms.length}`);
    console.log(`   Working advanced filtering: ${workingRooms.length}`);
    
    if (workingRooms.length > 0) {
      console.log('   🎉 SUCCESS: Advanced filtering is working!');
    } else if (recentRooms.length > 0) {
      console.log('   ⚠️  PARTIAL: Recent rooms found but filtering not working');
    } else {
      console.log('   ℹ️  INFO: No recent rooms to test. Create a new room from the mobile app.');
    }

  } catch (error) {
    console.error('❌ Error checking rooms:', error);
  }
}

testRoomCreationFixed().catch(console.error);
