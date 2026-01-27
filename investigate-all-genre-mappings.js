#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const lambda = new AWS.Lambda();

async function investigateAllGenreMappings() {
    console.log('🔍 Investigating all genre mappings needed for Movies vs TV...');
    
    try {
        // Test common genres to see which ones work for TV vs Movies
        const genresToTest = [
            { id: 28, name: 'Action' },
            { id: 12, name: 'Adventure' },
            { id: 16, name: 'Animation' },
            { id: 35, name: 'Comedy' },
            { id: 80, name: 'Crime' },
            { id: 99, name: 'Documentary' },
            { id: 18, name: 'Drama' },
            { id: 10751, name: 'Family' },
            { id: 14, name: 'Fantasy' },
            { id: 36, name: 'History' },
            { id: 27, name: 'Horror' },
            { id: 10402, name: 'Music' },
            { id: 9648, name: 'Mystery' },
            { id: 10749, name: 'Romance' },
            { id: 878, name: 'Science Fiction' },
            { id: 53, name: 'Thriller' },
            { id: 10752, name: 'War' },
            { id: 37, name: 'Western' }
        ];
        
        console.log('\n🧪 Testing each genre for TV availability...\n');
        
        const results = [];
        
        for (const genre of genresToTest) {
            console.log(`Testing ${genre.name} (${genre.id})...`);
            
            const testPayload = {
                info: { fieldName: 'getFilteredContent' },
                arguments: {
                    mediaType: 'TV',
                    genreIds: [genre.id],
                    limit: 5,
                    excludeIds: []
                }
            };
            
            try {
                const result = await lambda.invoke({
                    FunctionName: 'trinity-movie-dev',
                    Payload: JSON.stringify(testPayload)
                }).promise();
                
                if (result.StatusCode === 200) {
                    const response = JSON.parse(result.Payload);
                    
                    if (response.errorMessage) {
                        results.push({ genre, status: 'ERROR', count: 0, error: response.errorMessage });
                        console.log(`  ❌ ERROR: ${response.errorMessage}`);
                    } else if (Array.isArray(response)) {
                        const count = response.length;
                        results.push({ genre, status: count > 0 ? 'WORKS' : 'NO_CONTENT', count });
                        
                        if (count > 0) {
                            console.log(`  ✅ WORKS: ${count} items found`);
                            // Show first result as example
                            if (response[0]) {
                                console.log(`     Example: ${response[0].title} (${response[0].year})`);
                            }
                        } else {
                            console.log(`  ⚠️ NO CONTENT: 0 items found`);
                        }
                    } else {
                        results.push({ genre, status: 'UNKNOWN', count: 0 });
                        console.log(`  ❓ UNKNOWN response type`);
                    }
                } else {
                    results.push({ genre, status: 'LAMBDA_ERROR', count: 0 });
                    console.log(`  ❌ Lambda error: ${result.StatusCode}`);
                }
            } catch (error) {
                results.push({ genre, status: 'EXCEPTION', count: 0, error: error.message });
                console.log(`  ❌ Exception: ${error.message}`);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Summary
        console.log('\n📊 SUMMARY OF GENRE AVAILABILITY FOR TV:\n');
        
        const working = results.filter(r => r.status === 'WORKS');
        const noContent = results.filter(r => r.status === 'NO_CONTENT');
        const errors = results.filter(r => r.status === 'ERROR' || r.status === 'LAMBDA_ERROR' || r.status === 'EXCEPTION');
        
        console.log('✅ WORKING GENRES (have content):');
        working.forEach(r => {
            console.log(`   ${r.genre.name} (${r.genre.id}): ${r.count} items`);
        });
        
        console.log('\n⚠️ NO CONTENT GENRES (need mapping):');
        noContent.forEach(r => {
            console.log(`   ${r.genre.name} (${r.genre.id}): 0 items - NEEDS MAPPING`);
        });
        
        console.log('\n❌ ERROR GENRES (investigate):');
        errors.forEach(r => {
            console.log(`   ${r.genre.name} (${r.genre.id}): ${r.error || 'Unknown error'}`);
        });
        
        console.log('\n🎯 MAPPING RECOMMENDATIONS:');
        console.log('Based on this analysis, these genres likely need mapping for TV:');
        noContent.forEach(r => {
            console.log(`   ${r.genre.name} (${r.genre.id}) -> [suggest TV equivalent]`);
        });
        
    } catch (error) {
        console.error('❌ Investigation failed:', error);
    }
}

// Run the investigation
investigateAllGenreMappings().catch(console.error);
