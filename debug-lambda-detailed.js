/**
 * Detailed debug of Lambda execution to see what's happening step by step
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials are loaded from environment variables or AWS CLI
});

const lambda = new AWS.Lambda();

async function debugLambdaDetailed() {
  console.log('🔍 DETAILED LAMBDA DEBUG');
  console.log('═'.repeat(50));
  
  console.log('\n📺 Testing TV content with Animation (16) + Comedy (35)...');
  
  try {
    const event = {
      info: { fieldName: 'getFilteredContent' },
      arguments: { 
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy
        limit: 5, // Smaller limit for easier debugging
        excludeIds: []
      }
    };

    console.log('\n📤 Sending event to Lambda:');
    console.log(JSON.stringify(event, null, 2));

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(event),
      LogType: 'Tail' // Get logs
    }).promise();

    // Decode and show logs
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      console.log('\n📋 Lambda Logs:');
      console.log('─'.repeat(50));
      console.log(logs);
      console.log('─'.repeat(50));
    }

    const content = JSON.parse(result.Payload);
    
    if (content && Array.isArray(content)) {
      console.log(`\n✅ Retrieved ${content.length} items`);
      
      console.log('\n📋 Content Analysis:');
      content.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.title} (ID: ${item.tmdbId})`);
        console.log(`   Year: ${item.year || 'N/A'}`);
        console.log(`   Rating: ${item.rating || item.vote_average || 'N/A'}`);
        console.log(`   Overview: ${(item.overview || '').substring(0, 100)}...`);
        
        // Check if this makes sense for Animation + Comedy
        const title = item.title.toLowerCase();
        const overview = (item.overview || '').toLowerCase();
        
        const isAnimation = title.includes('anim') || overview.includes('anim') || 
                           title.includes('cartoon') || overview.includes('cartoon') ||
                           title.includes('simpson') || title.includes('family guy') ||
                           title.includes('south park');
        const isComedy = title.includes('comedy') || overview.includes('comedy') || 
                        overview.includes('humor') || overview.includes('funny') ||
                        title.includes('simpson') || title.includes('family guy');
        
        let relevance = '❓ Unknown';
        if (isAnimation && isComedy) {
          relevance = '✅ Perfect match (Animation + Comedy)';
        } else if (isAnimation || isComedy) {
          relevance = '⚠️ Partial match';
        } else {
          relevance = '❌ No clear match - PROBLEM!';
        }
        
        console.log(`   Relevance: ${relevance}`);
      });
      
    } else {
      console.log('❌ No content returned or invalid format');
      console.log('Response:', JSON.stringify(content, null, 2));
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('🎯 DEBUG COMPLETE');
}

// Run the debug
debugLambdaDetailed().catch(console.error);
