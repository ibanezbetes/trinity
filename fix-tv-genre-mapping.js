#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const lambda = new AWS.Lambda();

async function testCorrectTVGenres() {
    console.log('🔍 Testing correct TV genres for horror/thriller content...');
    
    try {
        // Test with Mystery + Crime genres (more common in TV)
        const testPayload = {
            info: {
                fieldName: 'getFilteredContent'
            },
            arguments: {
                mediaType: 'TV',
                genreIds: [9648, 80], // Mystery (9648) + Crime (80)
                limit: 10,
                excludeIds: []
            }
        };
        
        console.log('📺 Testing TV filtering with Mystery + Crime genres...');
        console.log('Expected: TV shows with mystery/crime elements (closer to horror/thriller)');
        
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
                
                console.log('\n🔍 Mystery/Crime TV Content:');
                response.forEach((item, index) => {
                    console.log(`${index + 1}. ${item.title} (${item.year}) - Rating: ${item.rating}`);
                    
                    // Check for relevant content
                    const title = item.title.toLowerCase();
                    if (title.includes('criminal') || title.includes('crime') || 
                        title.includes('mystery') || title.includes('detective') ||
                        title.includes('murder') || title.includes('investigation')) {
                        console.log(`   ✅ RELEVANT: This matches mystery/crime genre`);
                    } else if (title.includes('simpson') || title.includes('familia') || 
                               title.includes('friends') || title.includes('comedy')) {
                        console.log(`   ❌ PROBLEM: This is not mystery/crime content!`);
                    } else {
                        console.log(`   ❓ UNCLEAR: Need to verify genre match`);
                    }
                });
                
            } else {
                console.log('📊 Response type:', typeof response);
            }
        }
        
        // Test with single genre
        console.log('\n🧪 Testing with single Crime genre (80)...');
        const singleGenrePayload = {
            info: { fieldName: 'getFilteredContent' },
            arguments: {
                mediaType: 'TV',
                genreIds: [80], // Crime only
                limit: 5,
                excludeIds: []
            }
        };
        
        const singleResult = await lambda.invoke({
            FunctionName: 'trinity-movie-dev',
            Payload: JSON.stringify(singleGenrePayload)
        }).promise();
        
        if (singleResult.StatusCode === 200) {
            const singleResponse = JSON.parse(singleResult.Payload);
            if (Array.isArray(singleResponse)) {
                console.log(`📊 Crime-only results: ${singleResponse.length} items`);
                singleResponse.slice(0, 3).forEach((item, index) => {
                    console.log(`${index + 1}. ${item.title} (${item.year})`);
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testCorrectTVGenres().catch(console.error);
