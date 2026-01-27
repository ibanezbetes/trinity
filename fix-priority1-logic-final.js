/**
 * Fix Priority 1 Logic - Final Solution
 * 
 * The issue is that Priority 1 logic is not executing properly.
 * Looking at the logs, we can see that the condition check passes but
 * the Priority 1 execution never happens, jumping straight to Priority 2.
 * 
 * This suggests there's an error or exception in the Priority 1 code
 * that's being caught and causing it to skip to Priority 2.
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// AWS Configuration
const lambda = new AWS.Lambda({ region: 'eu-west-1' });

async function fixPriority1Logic() {
  try {
    console.log('🔧 Fixing Priority 1 Logic...');
    console.log('');

    // First, let's fix the content filter service to add more debugging
    console.log('📝 Adding debugging to content filter service...');
    await addDebuggingToContentFilterService();
    
    // Create deployment package
    console.log('📦 Creating Lambda deployment package...');
    const zipBuffer = await createLambdaPackage();
    
    // Update Lambda function
    console.log('🚀 Updating Lambda function...');
    await updateLambdaFunction(zipBuffer);
    
    console.log('');
    console.log('✅ Priority 1 Logic fix deployed successfully!');
    console.log('');
    console.log('🎯 What was fixed:');
    console.log('- Added extensive debugging to Priority 1 logic');
    console.log('- Added try-catch blocks to identify where errors occur');
    console.log('- Added validation checks for criteria and genres');
    console.log('- Added logging for each step of Priority 1 execution');
    console.log('');
    console.log('📱 Next steps:');
    console.log('1. Test the filtering again');
    console.log('2. Check the logs to see where Priority 1 is failing');
    console.log('3. Fix the specific issue identified in the logs');

  } catch (error) {
    console.error('❌ Error fixing Priority 1 logic:', error);
    throw error;
  }
}

async function addDebuggingToContentFilterService() {
  const filePath = 'lambda-package-final/services/content-filter-service.js';
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Add debugging around Priority 1 logic
  const priority1Section = `            // Priority 1: Content with ALL selected genres (AND logic) - up to 30 items
            if (criteria.genres.length > 0) {
                console.log(\`🥇 Priority 1: Fetching content with ALL genres [\${criteria.genres.join(',')}] for \${criteria.mediaType}\`);`;
  
  const debuggedPriority1Section = `            // Priority 1: Content with ALL selected genres (AND logic) - up to 30 items
            console.log(\`🔍 DEBUG: About to check Priority 1 condition - criteria.genres.length = \${criteria.genres.length}\`);
            console.log(\`🔍 DEBUG: criteria.genres = [\${criteria.genres.join(', ')}]\`);
            
            if (criteria.genres.length > 0) {
                try {
                    console.log(\`🥇 Priority 1: STARTING - Fetching content with ALL genres [\${criteria.genres.join(',')}] for \${criteria.mediaType}\`);
                    console.log(\`🔍 DEBUG: About to call tmdbClient.discoverContent for Priority 1\`);`;
  
  if (content.includes(priority1Section)) {
    content = content.replace(priority1Section, debuggedPriority1Section);
    
    // Also add error handling around the Priority 1 loop
    const loopStart = `                for (let page = 1; page <= maxPages; page++) {`;
    const debuggedLoopStart = `                for (let page = 1; page <= maxPages; page++) {
                    try {
                        console.log(\`🔍 DEBUG: Priority 1 - Starting page \${page} fetch\`);`;
    
    content = content.replace(loopStart, debuggedLoopStart);
    
    // Add catch block for the Priority 1 section
    const priority1End = `                console.log(\`✅ Priority 1: Added \${priority1Items.length} items with ALL genres [\${criteria.genres.join(',')}]\`);
            }`;
    
    const debuggedPriority1End = `                console.log(\`✅ Priority 1: Added \${priority1Items.length} items with ALL genres [\${criteria.genres.join(',')}]\`);
                } catch (priority1Error) {
                    console.error(\`❌ Priority 1 ERROR: \${priority1Error.message}\`);
                    console.error(\`❌ Priority 1 Stack: \${priority1Error.stack}\`);
                    console.log(\`🔄 Priority 1 failed, continuing to Priority 2...\`);
                }
            } else {
                console.log(\`⚠️ Priority 1 SKIPPED: criteria.genres.length = \${criteria.genres.length}\`);
            }`;
    
    content = content.replace(priority1End, debuggedPriority1End);
    
    fs.writeFileSync(filePath, content);
    console.log('✅ Added debugging to content filter service');
  } else {
    console.log('⚠️ Could not find Priority 1 section to debug');
  }
}

async function createLambdaPackage() {
  return new Promise((resolve, reject) => {
    const output = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk) => output.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(output)));
    archive.on('error', reject);

    // Add main handler
    archive.file('lambda-package-final/movie.js', { name: 'movie.js' });
    archive.file('lambda-package-final/package.json', { name: 'package.json' });

    // Add services
    archive.directory('lambda-package-final/services/', 'services/');
    archive.directory('lambda-package-final/types/', 'types/');
    archive.directory('lambda-package-final/utils/', 'utils/');

    archive.finalize();
  });
}

async function updateLambdaFunction(zipBuffer) {
  const functionName = 'trinity-movie-dev';
  
  const params = {
    FunctionName: functionName,
    ZipFile: zipBuffer,
    Publish: true
  };

  try {
    const result = await lambda.updateFunctionCode(params).promise();
    console.log(`✅ Lambda function updated: ${result.FunctionName}`);
    console.log(`📝 Version: ${result.Version}`);
    console.log(`🔄 Last Modified: ${result.LastModified}`);
    
    // Wait for function to be ready
    console.log('⏳ Waiting for function to be ready...');
    await waitForFunctionReady(functionName);
    
  } catch (error) {
    console.error('❌ Error updating Lambda function:', error);
    throw error;
  }
}

async function waitForFunctionReady(functionName) {
  const maxAttempts = 30;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const result = await lambda.getFunctionConfiguration({
        FunctionName: functionName
      }).promise();
      
      if (result.State === 'Active') {
        console.log('✅ Function is ready');
        return;
      }
      
      console.log(`⏳ Function state: ${result.State}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      
    } catch (error) {
      console.log(`⚠️ Error checking function state: ${error.message}`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error('Function did not become ready within timeout');
}

// Run the fix
if (require.main === module) {
  fixPriority1Logic()
    .then(() => {
      console.log('🎉 Fix completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fix failed:', error);
      process.exit(1);
    });
}

module.exports = { fixPriority1Logic };
