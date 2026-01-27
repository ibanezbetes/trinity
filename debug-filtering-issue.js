/**
 * Debug the filtering issue with irrelevant content
 * Test what's happening with TV genres 16 (Animation) + 35 (Comedy)
 */


// Cargar variables de entorno si existe archivo .env
try {
    require('dotenv').config();
} catch (e) {
    // dotenv no está instalado, usar variables de entorno del sistema
}

const AWS = require('aws-sdk');

// AWS Configuration - Credenciales desde variables de entorno
AWS.config.update({ 
    region: process.env.AWS_DEFAULT_REGION || 'eu-west-1'
    // Las credenciales se cargan automáticamente desde:
    // 1. Variables de entorno: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
    // 2. Archivo ~/.aws/credentials
    // 3. Roles IAM (en producción)
});

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials should be configured via environment variables or AWS CLI
  // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function debugFilteringIssue() {
  console.log('🔍 DEBUGGING FILTERING ISSUE');
  console.log('═'.repeat(50));
  
  console.log('\n📺 Testing TV content with Animation (16) + Comedy (35)...');
  
  try {
    const event = {
      info: { fieldName: 'getFilteredContent' },
      arguments: { 
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy
        limit: 10,
        excludeIds: []
      }
    };

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(event)
    }).promise();

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
                           title.includes('cartoon') || overview.includes('cartoon');
        const isComedy = title.includes('comedy') || overview.includes('comedy') || 
                        overview.includes('humor') || overview.includes('funny');
        
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
      
      // Count problematic content
      const problematic = content.filter(item => {
        const title = item.title.toLowerCase();
        const overview = (item.overview || '').toLowerCase();
        
        const isAnimation = title.includes('anim') || overview.includes('anim') || 
                           title.includes('cartoon') || overview.includes('cartoon');
        const isComedy = title.includes('comedy') || overview.includes('comedy') || 
                        overview.includes('humor') || overview.includes('funny');
        
        return !isAnimation && !isComedy;
      });
      
      console.log(`\n📊 Summary:`);
      console.log(`   Total items: ${content.length}`);
      console.log(`   Potentially problematic: ${problematic.length}`);
      console.log(`   Relevance rate: ${((content.length - problematic.length) / content.length * 100).toFixed(1)}%`);
      
      if (problematic.length > 0) {
        console.log(`\n❌ Problematic content:`);
        problematic.forEach(item => {
          console.log(`   - ${item.title} (${item.tmdbId})`);
        });
      }
      
    } else {
      console.log('❌ No content returned or invalid format');
      console.log('Response:', JSON.stringify(content, null, 2));
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the debug
debugFilteringIssue().catch(console.error);
