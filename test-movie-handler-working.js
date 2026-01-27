const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const cloudwatchlogs = new AWS.CloudWatchLogs();

async function testMovieHandlerWorking() {
  console.log('🎬 Testing if Movie Handler is now working...\n');

  try {
    const logGroupName = '/aws/lambda/trinity-movie-dev';
    
    console.log('⏳ Waiting 10 seconds for any new invocations...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Get the most recent log stream
    const logStreams = await cloudwatchlogs.describeLogStreams({
      logGroupName: logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 1
    }).promise();

    if (logStreams.logStreams.length === 0) {
      console.log('📝 No log streams found - handler hasn\'t been invoked since deployment');
      return;
    }

    const latestStream = logStreams.logStreams[0];
    console.log(`🔍 Checking latest stream: ${latestStream.logStreamName}`);

    // Get recent log events from the latest stream
    const events = await cloudwatchlogs.getLogEvents({
      logGroupName: logGroupName,
      logStreamName: latestStream.logStreamName,
      limit: 30,
      startFromHead: false
    }).promise();

    if (events.events.length === 0) {
      console.log('📝 No recent events in latest stream');
      return;
    }

    console.log('\n📋 Recent movie handler events:');
    
    let hasErrors = false;
    let hasSuccess = false;
    
    events.events.forEach(event => {
      const timestamp = new Date(event.timestamp).toISOString();
      const message = event.message.trim();
      
      if (message.includes('Cannot find module')) {
        console.log(`   [${timestamp}] 🚨 DEPENDENCY ERROR: ${message}`);
        hasErrors = true;
      } else if (message.includes('ERROR') || message.includes('❌')) {
        console.log(`   [${timestamp}] 🚨 ERROR: ${message}`);
        hasErrors = true;
      } else if (message.includes('Movie Handler:')) {
        console.log(`   [${timestamp}] 🎬 SUCCESS: ${message}`);
        hasSuccess = true;
      } else if (message.includes('TMDB')) {
        console.log(`   [${timestamp}] 🌐 TMDB: ${message}`);
        hasSuccess = true;
      } else if (message.includes('START RequestId') || message.includes('END RequestId')) {
        console.log(`   [${timestamp}] 📊 ${message}`);
      } else if (message.includes('INIT_START')) {
        console.log(`   [${timestamp}] 🚀 INIT: ${message}`);
      } else {
        console.log(`   [${timestamp}] ${message}`);
      }
    });

    console.log('\n📊 Analysis:');
    if (hasErrors) {
      console.log('❌ Movie handler still has dependency errors');
      console.log('🔧 The compiled movie.js file may not have been deployed correctly');
    } else if (hasSuccess) {
      console.log('✅ Movie handler is working correctly!');
      console.log('🎬 Successfully processing movie requests');
    } else {
      console.log('⚠️ Movie handler deployed but no recent activity');
      console.log('💡 Try creating a room with content filtering to test it');
    }

  } catch (error) {
    console.error('❌ Error checking movie handler status:', error);
  }
}

testMovieHandlerWorking();
