#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const cloudwatchLogs = new AWS.CloudWatchLogs();

async function checkLambdaLogs() {
    console.log('📋 Checking Lambda logs for errors...');
    
    try {
        // Get log groups for the Lambda function
        const logGroupName = '/aws/lambda/trinity-movie-dev';
        
        // Get recent log streams
        const streams = await cloudwatchLogs.describeLogStreams({
            logGroupName: logGroupName,
            orderBy: 'LastEventTime',
            descending: true,
            limit: 5
        }).promise();
        
        if (streams.logStreams.length === 0) {
            console.log('❌ No log streams found');
            return;
        }
        
        console.log(`📋 Found ${streams.logStreams.length} recent log streams`);
        
        // Get logs from the most recent stream
        const latestStream = streams.logStreams[0];
        console.log(`📋 Checking latest stream: ${latestStream.logStreamName}`);
        
        const logs = await cloudwatchLogs.getLogEvents({
            logGroupName: logGroupName,
            logStreamName: latestStream.logStreamName,
            limit: 50,
            startFromHead: false
        }).promise();
        
        console.log(`📋 Found ${logs.events.length} log events`);
        
        // Show recent logs
        logs.events.forEach(event => {
            const timestamp = new Date(event.timestamp).toISOString();
            console.log(`[${timestamp}] ${event.message}`);
        });
        
    } catch (error) {
        console.error('❌ Failed to check logs:', error);
    }
}

// Run the check
checkLambdaLogs().catch(console.error);
