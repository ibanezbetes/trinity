#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const lambda = new AWS.Lambda();

async function testCompleteGenreMapping() {
    console.log('🧪 Testing complete genre mapping for TV...');
    
    const testCases = [
        { name: 'Action', genreIds: [28], expectedMapping: 'Drama (18)' },
        { name: 'Adventure', genreIds: [12], expectedMapping: 'Drama (18)' },
        { name: 'Fantasy', genreIds: [14], expectedMapping: 'Drama (18)' },
        { name: 'Science Fiction', genreIds: [878], expectedMapping: 'Drama (18)' },
        { name: 'War', genreIds: [10752], expectedMapping: 'History (36)' },
        { name: 'Music', genreIds: [10402], expectedMapping: 'Documentary (99)' },
        { name: 'Horror + Thriller', genreIds: [27, 53], expectedMapping: 'Mystery + Crime' }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n🎬 Testing ${testCase.name} (${testCase.genreIds.join(', ')})...`);
        console.log(`   Expected mapping: ${testCase.expectedMapping}`);
        
        try {
            const testPayload = {
                info: { fieldName: 'getFilteredContent' },
                arguments: {
                    mediaType: 'TV',
                    genreIds: testCase.genreIds,
                    limit: 5,
                    excludeIds: []
                }
            };
            
            const result = await lambda.invoke({
                FunctionName: 'trinity-movie-dev',
                Payload: JSON.stringify(testPayload)
            }).promise();
            
            if (result.StatusCode === 200) {
                const response = JSON.parse(result.Payload);
                
                if (response.errorMessage) {
                    console.log(`   ❌ ERROR: ${response.errorMessage}`);
                } else if (Array.isArray(response)) {
                    const count = response.length;
                    console.log(`   ✅ SUCCESS: ${count} items returned`);
                    
                    if (count > 0) {
                        console.log(`   📺 Examples:`);
                        response.slice(0, 2).forEach((item, index) => {
                            console.log(`      ${index + 1}. ${item.title} (${item.year})`);
                        });
                    }
                } else {
                    console.log(`   ❓ Unexpected response type: ${typeof response}`);
                }
            } else {
                console.log(`   ❌ Lambda error: ${result.StatusCode}`);
            }
            
        } catch (error) {
            console.log(`   ❌ Exception: ${error.message}`);
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('\n🎉 Complete genre mapping test finished!');
    console.log('\n📊 Summary:');
    console.log('- All previously failing genres should now return content');
    console.log('- Content should be relevant to the original genre intent');
    console.log('- User experience should be consistent across all genres');
}

// Run the test
testCompleteGenreMapping().catch(console.error);
