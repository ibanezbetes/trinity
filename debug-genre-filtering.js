#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const lambda = new AWS.Lambda();

async function debugGenreFiltering() {
    console.log('🔍 Testing TV genre mapping: Terror + Thriller -> Mystery + Crime...');
    
    try {
        // Test the Lambda function with Terror + Thriller genres
        const testPayload = {
            info: {
                fieldName: 'getFilteredContent'
            },
            arguments: {
                mediaType: 'TV',
                genreIds: [27, 53], // Terror (27) + Thriller (53) - should map to Mystery + Crime
                limit: 10,
                excludeIds: []
            }
        };
        
        console.log('📺 Testing TV filtering with Terror + Thriller genres...');
        console.log('Expected: Only TV shows with Horror or Thriller genres');
        console.log('Problem: Getting comedy shows like Los Simpson, Padre de familia');
        
        const params = {
            FunctionName: 'trinity-movie-dev',
            Payload: JSON.stringify(testPayload)
        };
        
        const result = await lambda.invoke(params).promise();
        
        if (result.StatusCode === 200) {
            const response = JSON.parse(result.Payload);
            
            if (response.errorMessage) {
                console.error('❌ Lambda returned error:', response.errorMessage);
            } else if (Array.isArray(response)) {
                console.log(`📊 Returned ${response.length} items`);
                
                // Analyze the results
                console.log('\n🔍 Content Analysis:');
                response.forEach((item, index) => {
                    console.log(`${index + 1}. ${item.title} (${item.year}) - Rating: ${item.rating}`);
                    
                    // Flag potentially incorrect content
                    const title = item.title.toLowerCase();
                    if (title.includes('simpson') || title.includes('familia') || title.includes('family guy')) {
                        console.log(`   ❌ PROBLEM: This is comedy, not horror/thriller!`);
                    } else if (title.includes('stranger') || title.includes('horror') || title.includes('terror')) {
                        console.log(`   ✅ CORRECT: This matches horror/thriller genre`);
                    } else {
                        console.log(`   ❓ UNCLEAR: Need to verify genre match`);
                    }
                });
                
                // Check for duplicates
                const titles = response.map(item => item.title);
                const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index);
                if (duplicates.length > 0) {
                    console.log(`\n❌ DUPLICATES FOUND: ${duplicates.join(', ')}`);
                } else {
                    console.log(`\n✅ NO DUPLICATES: All titles are unique`);
                }
                
            } else {
                console.log('📊 Response type:', typeof response);
                console.log('Response:', JSON.stringify(response, null, 2));
            }
        } else {
            console.error('❌ Lambda invocation failed with status:', result.StatusCode);
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

// Run the debug
debugGenreFiltering().catch(console.error);
