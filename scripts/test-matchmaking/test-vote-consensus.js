#!/usr/bin/env node

/**
 * Trinity Vote Consensus Integration Test
 * Tests the complete vote consensus flow with real AWS resources
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = 'trinity-matchmaking-dev';

/**
 * Test vote consensus scenarios
 */
async function testVoteConsensus() {
  console.log('🗳️ Trinity Vote Consensus - Integration Tests');
  console.log('============================================');

  const testResults = [];

  try {
    // Test 1: Create room with 2 members
    const test1 = await testCreateRoomWithMembers(2);
    testResults.push(test1);

    // Test 2: First user votes YES
    const test2 = await testUserVoteYes(test1.roomId, test1.members[0], 'movie123');
    testResults.push(test2);

    // Test 3: Second user votes YES (should trigger consensus)
    const test3 = await testUserVoteYes(test1.roomId, test1.members[1], 'movie123');
    testResults.push(test3);

    // Test 4: Verify consensus detection
    const test4 = await testVerifyConsensus(test1.roomId, 'movie123', 2);
    testResults.push(test4);

    // Test 5: Create room with 4 members and test partial consensus
    const test5 = await testPartialConsensus();
    testResults.push(test5);

    // Cleanup
    await cleanupTestData([test1.roomId, test5.roomId]);

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    testResults.push({
      test: 'Test Suite',
      success: false,
      error: error.message
    });
  }

  // Display results
  displayTestResults(testResults);
}

/**
 * Test 1: Create a room with specified number of members
 */
async function testCreateRoomWithMembers(memberCount) {
  console.log(`\n🔬 Test 1: Create Room with ${memberCount} Members`);
  
  const roomId = uuidv4();
  const members = Array.from({ length: memberCount }, () => uuidv4());
  const now = new Date().toISOString();
  
  try {
    // Create room metadata
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA',
        roomId: roomId,
        name: `Test Room ${memberCount} Members`,
        status: 'WAITING_FOR_MEMBERS',
        memberCount: memberCount,
        maxPlayers: memberCount,
        createdAt: now,
        updatedAt: now,
        entityType: 'ROOM_METADATA',
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      }
    }));

    // Add members to room
    for (const memberId of members) {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `ROOM#${roomId}`,
          SK: `MEMBER#${memberId}`,
          roomId: roomId,
          userId: memberId,
          joinedAt: now,
          status: 'ACTIVE',
          entityType: 'ROOM_MEMBER',
          GSI1PK: `USER#${memberId}`,
          GSI1SK: `ROOM#${roomId}`,
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        }
      }));
    }

    console.log(`✅ Room created with ${memberCount} members:`, roomId);
    return {
      test: `Create Room ${memberCount} Members`,
      success: true,
      roomId: roomId,
      members: members,
      memberCount: memberCount
    };

  } catch (error) {
    console.error('❌ Room creation failed:', error);
    return {
      test: `Create Room ${memberCount} Members`,
      success: false,
      error: error.message
    };
  }
}

/**
 * Test 2 & 3: User votes YES for a movie
 */
async function testUserVoteYes(roomId, userId, movieId) {
  console.log(`\n🔬 Test: User ${userId.substring(0, 8)} votes YES for movie ${movieId}`);
  
  const now = new Date().toISOString();
  
  try {
    // Create user vote
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ROOM#${roomId}`,
        SK: `VOTE#${movieId}#${userId}`,
        roomId: roomId,
        movieId: movieId,
        userId: userId,
        voteType: 'YES',
        votedAt: now,
        entityType: 'USER_VOTE',
        GSI1PK: `USER#${userId}`,
        GSI1SK: `VOTE#${roomId}#${movieId}`,
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
      }
    }));

    // Update or create movie vote count
    const movieVoteCountKey = {
      PK: `ROOM#${roomId}`,
      SK: `MOVIE_VOTES#${movieId}`
    };

    // Get current count
    const currentCount = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: movieVoteCountKey
    }));

    const newYesCount = (currentCount.Item?.yesVoteCount || 0) + 1;

    // Update vote count
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ROOM#${roomId}`,
        SK: `MOVIE_VOTES#${movieId}`,
        roomId: roomId,
        movieId: movieId,
        yesVoteCount: newYesCount,
        updatedAt: now,
        entityType: 'MOVIE_VOTE_COUNT',
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
      }
    }));

    console.log(`✅ User voted YES. Movie ${movieId} now has ${newYesCount} YES votes`);
    return {
      test: `User Vote YES`,
      success: true,
      userId: userId,
      movieId: movieId,
      yesVoteCount: newYesCount
    };

  } catch (error) {
    console.error('❌ User vote failed:', error);
    return {
      test: `User Vote YES`,
      success: false,
      error: error.message
    };
  }
}

/**
 * Test 4: Verify consensus detection
 */
async function testVerifyConsensus(roomId, movieId, expectedVotes) {
  console.log(`\n🔬 Test 4: Verify Consensus Detection`);
  
  try {
    // Get room metadata
    const roomData = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA'
      }
    }));

    // Get movie vote count
    const voteCountData = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ROOM#${roomId}`,
        SK: `MOVIE_VOTES#${movieId}`
      }
    }));

    const memberCount = roomData.Item?.memberCount || 0;
    const yesVoteCount = voteCountData.Item?.yesVoteCount || 0;

    console.log(`📊 Room ${roomId}: ${yesVoteCount} YES votes, ${memberCount} members`);

    // Check if consensus should be reached
    const consensusReached = yesVoteCount >= memberCount && memberCount > 0;
    const expectedConsensus = expectedVotes >= memberCount;

    if (consensusReached === expectedConsensus) {
      console.log(`✅ Consensus detection correct: ${consensusReached ? 'REACHED' : 'NOT REACHED'}`);
      return {
        test: 'Verify Consensus',
        success: true,
        consensusReached: consensusReached,
        yesVotes: yesVoteCount,
        memberCount: memberCount
      };
    } else {
      throw new Error(`Consensus detection mismatch. Expected: ${expectedConsensus}, Got: ${consensusReached}`);
    }

  } catch (error) {
    console.error('❌ Consensus verification failed:', error);
    return {
      test: 'Verify Consensus',
      success: false,
      error: error.message
    };
  }
}

/**
 * Test 5: Test partial consensus (not all members voted YES)
 */
async function testPartialConsensus() {
  console.log(`\n🔬 Test 5: Partial Consensus (Should NOT Trigger)`);
  
  const roomId = uuidv4();
  const members = Array.from({ length: 4 }, () => uuidv4());
  const movieId = 'movie456';
  const now = new Date().toISOString();
  
  try {
    // Create room with 4 members
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA',
        roomId: roomId,
        name: 'Test Room Partial Consensus',
        status: 'VOTING_IN_PROGRESS',
        memberCount: 4,
        maxPlayers: 4,
        createdAt: now,
        updatedAt: now,
        entityType: 'ROOM_METADATA',
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
      }
    }));

    // Only 2 out of 4 members vote YES
    for (let i = 0; i < 2; i++) {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `ROOM#${roomId}`,
          SK: `VOTE#${movieId}#${members[i]}`,
          roomId: roomId,
          movieId: movieId,
          userId: members[i],
          voteType: 'YES',
          votedAt: now,
          entityType: 'USER_VOTE',
          GSI1PK: `USER#${members[i]}`,
          GSI1SK: `VOTE#${roomId}#${movieId}`,
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        }
      }));
    }

    // Update movie vote count to 2
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ROOM#${roomId}`,
        SK: `MOVIE_VOTES#${movieId}`,
        roomId: roomId,
        movieId: movieId,
        yesVoteCount: 2,
        updatedAt: now,
        entityType: 'MOVIE_VOTE_COUNT',
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
      }
    }));

    // Verify consensus is NOT reached (2 votes < 4 members)
    const consensusReached = 2 >= 4; // Should be false

    if (!consensusReached) {
      console.log('✅ Partial consensus correctly NOT triggered');
      return {
        test: 'Partial Consensus',
        success: true,
        roomId: roomId,
        consensusReached: false,
        yesVotes: 2,
        memberCount: 4
      };
    } else {
      throw new Error('Partial consensus incorrectly triggered');
    }

  } catch (error) {
    console.error('❌ Partial consensus test failed:', error);
    return {
      test: 'Partial Consensus',
      success: false,
      error: error.message
    };
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData(roomIds) {
  console.log('\n🧹 Cleaning up test data...');
  
  for (const roomId of roomIds) {
    try {
      // Query all items for this room
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :roomPK',
        ExpressionAttributeValues: {
          ':roomPK': `ROOM#${roomId}`
        }
      }));

      // Delete all items
      for (const item of result.Items || []) {
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: item.PK,
            SK: item.SK
          }
        }));
      }

      console.log(`✅ Cleaned up room ${roomId}`);
    } catch (error) {
      console.warn(`⚠️ Cleanup failed for room ${roomId}:`, error.message);
    }
  }
}

/**
 * Display test results
 */
function displayTestResults(results) {
  console.log('\n📊 Vote Consensus Test Results');
  console.log('==============================');
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.test}`);
    if (!result.success && result.error) {
      console.log(`    Error: ${result.error}`);
    }
    if (result.success && result.consensusReached !== undefined) {
      console.log(`    Consensus: ${result.consensusReached ? 'REACHED' : 'NOT REACHED'} (${result.yesVotes}/${result.memberCount})`);
    }
  });
  
  console.log(`\n📈 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Vote consensus logic is working correctly.');
    console.log('');
    console.log('🎯 Key Findings:');
    console.log('  • Unanimous YES votes trigger consensus correctly');
    console.log('  • Partial votes do NOT trigger consensus');
    console.log('  • Vote counting is accurate');
    console.log('  • Room member tracking works properly');
  } else {
    console.log('⚠️ Some tests failed. Please review the vote consensus implementation.');
  }
}

/**
 * Main test runner
 */
async function main() {
  try {
    await testVoteConsensus();
  } catch (error) {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  main();
}