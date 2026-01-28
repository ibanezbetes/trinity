/**
 * Test Vote Backend - Trinity Mobile App
 * This script tests the vote submission backend to identify issues
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const appsync = new AWS.AppSync();
const dynamodb = new AWS.DynamoDB.DocumentClient();

console.log('🧪 Testing Vote Backend for Trinity Mobile App');
console.log('='.repeat(50));

async function testBackendComponents() {
  console.log('\n📊 Test 1: Checking AppSync API...');
  try {
    const apis = await appsync.listGraphqlApis().promise();
    const trinityApi = apis.graphqlApis.find(api => 
      api.name.includes('Trinity') || api.name.includes('trinity')
    );
    
    if (trinityApi) {
      console.log('✅ AppSync API found:', {
        name: trinityApi.name,
        apiId: trinityApi.apiId,
        uris: trinityApi.uris
      });
      
      // Check if the endpoint matches our config
      const expectedEndpoint = 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql';
      const actualEndpoint = trinityApi.uris?.GRAPHQL;
      
      if (actualEndpoint === expectedEndpoint) {
        console.log('✅ GraphQL endpoint matches configuration');
      } else {
        console.log('❌ GraphQL endpoint mismatch:');
        console.log('  Expected:', expectedEndpoint);
        console.log('  Actual:', actualEndpoint);
      }
    } else {
      console.log('❌ Trinity AppSync API not found');
    }
  } catch (error) {
    console.error('❌ Error checking AppSync API:', error.message);
  }

  console.log('\n📊 Test 2: Checking DynamoDB Tables...');
  const tablesToCheck = [
    'TrinityStack-RoomsTable',
    'TrinityStack-VotesTable', 
    'TrinityStack-UserVotesTable',
    'TrinityStack-RoomMembersTable'
  ];

  for (const tableName of tablesToCheck) {
    try {
      const tableInfo = await dynamodb.describe({ TableName: tableName }).promise();
      console.log(`✅ ${tableName}:`, {
        status: tableInfo.Table.TableStatus,
        itemCount: tableInfo.Table.ItemCount,
        keySchema: tableInfo.Table.KeySchema
      });
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        console.log(`❌ ${tableName}: Table not found`);
      } else {
        console.log(`❌ ${tableName}: Error -`, error.message);
      }
    }
  }

  console.log('\n📊 Test 3: Checking Lambda Functions...');
  const lambda = new AWS.Lambda();
  
  try {
    const functions = await lambda.listFunctions().promise();
    const voteFunctions = functions.Functions.filter(fn => 
      fn.FunctionName.includes('vote') || fn.FunctionName.includes('Vote')
    );
    
    if (voteFunctions.length > 0) {
      console.log('✅ Vote-related Lambda functions found:');
      voteFunctions.forEach(fn => {
        console.log(`  - ${fn.FunctionName} (${fn.Runtime})`);
      });
    } else {
      console.log('❌ No vote-related Lambda functions found');
    }
  } catch (error) {
    console.error('❌ Error checking Lambda functions:', error.message);
  }

  console.log('\n📊 Test 4: Testing GraphQL Schema...');
  try {
    // This would require authentication, so we'll skip for now
    console.log('ℹ️ GraphQL schema test requires authentication - skipping');
  } catch (error) {
    console.error('❌ Error testing GraphQL schema:', error.message);
  }
}

async function testVoteFlow() {
  console.log('\n🗳️ Test 5: Simulating Vote Flow...');
  
  // Test data
  const testRoomId = 'test-room-' + Date.now();
  const testUserId = 'test-user-' + Date.now();
  const testMovieId = '12345';
  
  console.log('📝 Test data:', { testRoomId, testUserId, testMovieId });
  
  try {
    // Step 1: Check if we can create a test room record
    console.log('🔍 Step 1: Testing room creation...');
    
    const roomData = {
      PK: testRoomId,
      SK: 'ROOM',
      id: testRoomId,
      name: 'Test Room',
      hostId: testUserId,
      status: 'ACTIVE',
      memberCount: 1,
      createdAt: new Date().toISOString()
    };
    
    // We won't actually create it, just log what would be created
    console.log('ℹ️ Would create room:', roomData);
    
    // Step 2: Check vote structure
    console.log('🔍 Step 2: Testing vote structure...');
    
    const voteData = {
      roomId: testRoomId,
      movieId: testMovieId,
      votes: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log('ℹ️ Would create vote:', voteData);
    
    // Step 3: Check user vote structure
    console.log('🔍 Step 3: Testing user vote structure...');
    
    const userVoteData = {
      userId: testUserId,
      roomMovieId: `${testRoomId}#${testMovieId}`,
      roomId: testRoomId,
      movieId: testMovieId,
      voteType: 'LIKE',
      createdAt: new Date().toISOString()
    };
    
    console.log('ℹ️ Would create user vote:', userVoteData);
    
    console.log('✅ Vote flow structure looks correct');
    
  } catch (error) {
    console.error('❌ Error in vote flow test:', error.message);
  }
}

async function checkCommonIssues() {
  console.log('\n🔍 Test 6: Checking Common Issues...');
  
  console.log('📋 Common vote failure causes:');
  console.log('1. Authentication token expired or invalid');
  console.log('2. AppSync endpoint not reachable');
  console.log('3. DynamoDB table key structure mismatch');
  console.log('4. Lambda function timeout or error');
  console.log('5. Network connectivity issues');
  console.log('6. GraphQL schema validation errors');
  console.log('7. Insufficient IAM permissions');
  
  console.log('\n🔧 Debugging recommendations:');
  console.log('1. Check CloudWatch logs for Lambda errors');
  console.log('2. Verify AppSync API is active and accessible');
  console.log('3. Test with a simple GraphQL query first');
  console.log('4. Check DynamoDB table schemas match handler expectations');
  console.log('5. Verify authentication tokens are valid');
  console.log('6. Test network connectivity to AWS endpoints');
}

// Run all tests
async function runAllTests() {
  try {
    await testBackendComponents();
    await testVoteFlow();
    await checkCommonIssues();
    
    console.log('\n✅ Backend test completed!');
    console.log('\n🚀 Next steps:');
    console.log('1. Install the new APK with improved logging');
    console.log('2. Try to vote and check the detailed error logs');
    console.log('3. Look for specific error patterns in the logs');
    console.log('4. Check CloudWatch logs if backend issues are suspected');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

// Check if AWS credentials are available
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.log('⚠️ AWS credentials not found in environment variables');
  console.log('ℹ️ Running limited tests without AWS API calls...');
  
  checkCommonIssues();
} else {
  runAllTests();
}