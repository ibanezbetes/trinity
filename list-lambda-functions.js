/**
 * List Lambda Functions
 * 
 * Lists all Lambda functions to find the correct movie handler function name
 */

const AWS = require('aws-sdk');

// AWS Configuration
const lambda = new AWS.Lambda({ region: 'eu-west-1' });

async function listLambdaFunctions() {
  try {
    console.log('🔍 Listing Lambda functions...');
    console.log('');

    const result = await lambda.listFunctions().promise();
    
    console.log(`Found ${result.Functions.length} Lambda functions:`);
    console.log('');
    
    result.Functions.forEach((func, index) => {
      console.log(`${index + 1}. ${func.FunctionName}`);
      console.log(`   Runtime: ${func.Runtime}`);
      console.log(`   Handler: ${func.Handler}`);
      console.log(`   Last Modified: ${func.LastModified}`);
      console.log('');
    });
    
    // Look for movie-related functions
    const movieFunctions = result.Functions.filter(func => 
      func.FunctionName.toLowerCase().includes('movie') ||
      func.Handler?.includes('movie')
    );
    
    if (movieFunctions.length > 0) {
      console.log('🎬 Movie-related functions found:');
      movieFunctions.forEach(func => {
        console.log(`- ${func.FunctionName}`);
      });
    } else {
      console.log('⚠️ No movie-related functions found');
    }

  } catch (error) {
    console.error('❌ Error listing Lambda functions:', error);
    throw error;
  }
}

// Run the listing
if (require.main === module) {
  listLambdaFunctions()
    .then(() => {
      console.log('✅ Function listing completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Function listing failed:', error);
      process.exit(1);
    });
}

module.exports = { listLambdaFunctions };
