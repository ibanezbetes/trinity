const { CloudWatchLogsClient, DescribeLogGroupsCommand, DescribeLogStreamsCommand, GetLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const client = new CloudWatchLogsClient({ region: 'eu-west-1' });

async function checkSpecificMovieLogs() {
  console.log('🔍 CHECKING LAMBDA LOGS FOR RECENT ROOM CREATION\n');

  try {
    // Get all log groups
    const logGroups = await client.send(new DescribeLogGroupsCommand({
      logGroupNamePrefix: '/aws/lambda/trinity'
    }));

    console.log('📋 Available Lambda log groups:');
    logGroups.logGroups?.forEach(group => {
      console.log(`   - ${group.logGroupName}`);
    });
    console.log('');

    // Focus on the room handler
    const roomLogGroup = '/aws/lambda/trinity-room-dev';
    
    console.log(`🔍 Checking recent logs in ${roomLogGroup}...`);

    // Get recent log streams
    const streams = await client.send(new DescribeLogStreamsCommand({
      logGroupName: roomLogGroup,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 5
    }));

    if (!streams.logStreams || streams.logStreams.length === 0) {
      console.log('❌ No log streams found');
      return;
    }

    console.log(`📋 Found ${streams.logStreams.length} recent log streams:`);
    streams.logStreams.forEach((stream, index) => {
      const lastEvent = new Date(stream.lastEventTime || 0).toLocaleString();
      console.log(`   ${index + 1}. ${stream.logStreamName} (last: ${lastEvent})`);
    });
    console.log('');

    // Get logs from the most recent stream
    const mostRecentStream = streams.logStreams[0];
    console.log(`🔍 Reading logs from: ${mostRecentStream.logStreamName}`);

    const events = await client.send(new GetLogEventsCommand({
      logGroupName: roomLogGroup,
      logStreamName: mostRecentStream.logStreamName,
      startFromHead: false,
      limit: 100
    }));

    if (!events.events || events.events.length === 0) {
      console.log('❌ No log events found');
      return;
    }

    console.log(`📋 Found ${events.events.length} log events. Recent events:\n`);

    // Filter and display relevant events
    const relevantEvents = events.events
      .filter(event => {
        const message = event.message || '';
        return message.includes('createRoom') || 
               message.includes('ContentFilterService') || 
               message.includes('TMDB') ||
               message.includes('filtering') ||
               message.includes('ERROR') ||
               message.includes('❌') ||
               message.includes('✅') ||
               message.includes('🎯') ||
               message.includes('🎬') ||
               message.includes('mediaType') ||
               message.includes('genreIds');
      })
      .slice(-20); // Last 20 relevant events

    relevantEvents.forEach((event, index) => {
      const timestamp = new Date(event.timestamp || 0).toLocaleTimeString();
      const message = (event.message || '').trim();
      console.log(`[${timestamp}] ${message}`);
    });

    console.log('\n🔍 Looking for specific patterns...');

    // Look for ContentFilterService execution
    const contentFilterEvents = events.events.filter(event => 
      (event.message || '').includes('ContentFilterService')
    );

    if (contentFilterEvents.length > 0) {
      console.log('\n🎬 ContentFilterService events:');
      contentFilterEvents.slice(-5).forEach(event => {
        const timestamp = new Date(event.timestamp || 0).toLocaleTimeString();
        console.log(`[${timestamp}] ${event.message?.trim()}`);
      });
    } else {
      console.log('\n❌ No ContentFilterService events found - this is the problem!');
    }

    // Look for errors
    const errorEvents = events.events.filter(event => 
      (event.message || '').includes('ERROR') || 
      (event.message || '').includes('❌') ||
      (event.message || '').includes('Error')
    );

    if (errorEvents.length > 0) {
      console.log('\n❌ Error events:');
      errorEvents.slice(-5).forEach(event => {
        const timestamp = new Date(event.timestamp || 0).toLocaleTimeString();
        console.log(`[${timestamp}] ${event.message?.trim()}`);
      });
    }

    // Look for room creation success
    const roomCreationEvents = events.events.filter(event => 
      (event.message || '').includes('Room created:') ||
      (event.message || '').includes('✅') && (event.message || '').includes('room')
    );

    if (roomCreationEvents.length > 0) {
      console.log('\n✅ Room creation events:');
      roomCreationEvents.slice(-3).forEach(event => {
        const timestamp = new Date(event.timestamp || 0).toLocaleTimeString();
        console.log(`[${timestamp}] ${event.message?.trim()}`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking logs:', error.message);
    
    if (error.name === 'ResourceNotFoundException') {
      console.log('\n💡 The log group might not exist or might be in a different region.');
      console.log('Try checking the AWS Console for the correct log group name.');
    }
  }
}

checkSpecificMovieLogs().catch(console.error);
