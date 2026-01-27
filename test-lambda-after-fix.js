#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const lambda = new AWS.Lambda();

async function testLambdaFunction() {
    console.log('🧪 Testing Lambda function after structure fix...');
    
    try {
        // Test the Lambda function directly
        const testPayload = {
            info: {
                fieldName: 'getFilteredContent'
            },
            arguments: {
                mediaType: 'TV',
                genreIds: [35], // Comedy
                limit: 5,
                excludeIds: []
            }
        };
        
        console.log('📺 Testing TV filtering with payload:', JSON.stringify(testPayload, null, 2));
        
        const params = {
            FunctionName: 'trinity-movie-dev',
            Payload: JSON.stringify(testPayload)
        };
        
        const result = await lambda.invoke(params).promise();
        
        if (result.StatusCode === 200) {
            const response = JSON.parse(result.Payload);
            console.log('✅ Lambda invocation successful!');
            
            if (response.errorMessage) {
                console.error('❌ Lambda returned error:', response.errorMessage);
                console.error('Error details:', response.errorType);
                console.error('Stack trace:', response.trace);
            } else {
                console.log('🎯 Lambda response preview:', JSON.stringify(response, null, 2).substring(0, 500) + '...');
                
                if (Array.isArray(response) && response.length > 0) {
                    console.log(`📊 Returned ${response.length} items`);
                    console.log('🔍 First item mediaType:', response[0].mediaType);
                    console.log('🔍 First item title:', response[0].title);
                } else {
                    console.log('📊 Response type:', typeof response);
                }
            }
        } else {
            console.error('❌ Lambda invocation failed with status:', result.StatusCode);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testLambdaFunction().catch(console.error);
