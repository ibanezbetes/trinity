const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const cloudwatchlogs = new AWS.CloudWatchLogs();

async function checkMovieHandlerLogs() {
  console.log('📋 Checking Movie Handler CloudWatch Logs...\n');

  try {
    // List log groups to find the movie handler
    const logGroups = await cloudwatchlogs.describeLogGroups({
      logGroupNamePrefix: '/aws/lambda/TrinityMvpStack'
    }).promise();

    console.log('📁 Available log groups:');
    logGroups.logGroups.forEach(group => {
      console.log(`   ${group.logGroupName}`);
    });

    // Look for movie handler log group
    const movieHandlerLogGroup = logGroups.logGroups.find(group => 
      group.logGroupName.includes('movie') || group.logGroupName.includes('Movie')
    );

    if (!movieHandlerLogGroup) {
      console.log('\n❌ Movie handler log group not found');
      return;
    }

    console.log(`\n📋 Checking logs for: ${movieHandlerLogGroup.logGroupName}`);

    // Get recent log streams
    const logStreams = await cloudwatchlogs.describeLogStreams({
      logGroupName: movieHandlerLogGroup.logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 5
    }).promise();

    if (logStreams.logStreams.length === 0) {
      console.log('📝 No log streams found - handler hasn\'t been invoked yet');
      return;
    }

    console.log(`\n📝 Recent log streams (${logStreams.logStreams.length}):`);
    
    for (const stream of logStreams.logStreams.slice(0, 2)) {
      console.log(`\n🔍 Stream: ${stream.logStreamName}`);
      console.log(`   Last event: ${new Date(stream.lastEventTime).toISOString()}`);

      // Get recent log events
      const events = await cloudwatchlogs.getLogEvents({
        logGroupName: movieHandlerLogGroup.logGroupName,
        logStreamName: stream.logStreamName,
        limit: 10,
        startFromHead: false
      }).promise();

      if (events.events.length > 0) {
        console.log('   Recent events:');
        events.events.forEach(event => {
          const timestamp = new Date(event.timestamp).toISOString();
          console.log(`   [${timestamp}] ${event.message}`);
        });
      } else {
        console.log('   No recent events');
      }
    }

  } catch (error) {
    console.error('❌ Error checking logs:', error);
  }
}

checkMovieHandlerLogs();
