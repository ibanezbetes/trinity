/**
 * Deploy the filtering fix to AWS Lambda
 * Fixes:
 * 1. Correct import path for content-filter-service
 * 2. Updated content-filter-service with complete genre mapping
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function deployFilteringFix() {
  console.log('🚀 DEPLOYING FILTERING FIX');
  console.log('═'.repeat(50));
  
  try {
    // Step 1: Verify files are correct
    console.log('\n1️⃣ Verifying files...');
    
    const movieHandlerPath = 'infrastructure/src/handlers/movie.js';
    const contentFilterPath = 'infrastructure/src/services/content-filter-service.js';
    
    // Check movie handler import
    const movieHandlerContent = fs.readFileSync(movieHandlerPath, 'utf8');
    if (movieHandlerContent.includes('require("../services/content-filter-service")')) {
      console.log('   ✅ Movie handler import path is correct');
    } else {
      console.log('   ❌ Movie handler import path is incorrect');
      return;
    }
    
    // Check content filter service has genre mapping
    const contentFilterContent = fs.readFileSync(contentFilterPath, 'utf8');
    if (contentFilterContent.includes('GENRE_MAPPING') && contentFilterContent.includes('mapGenresForMediaType')) {
      console.log('   ✅ Content filter service has complete genre mapping');
    } else {
      console.log('   ❌ Content filter service is missing genre mapping');
      return;
    }
    
    // Step 2: Build the project
    console.log('\n2️⃣ Building project...');
    process.chdir('infrastructure');
    
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('   ✅ Build completed successfully');
    } catch (error) {
      console.error('   ❌ Build failed:', error.message);
      return;
    }
    
    // Step 3: Deploy to AWS
    console.log('\n3️⃣ Deploying to AWS...');
    
    try {
      execSync('npm run deploy', { stdio: 'inherit' });
      console.log('   ✅ Deployment completed successfully');
    } catch (error) {
      console.error('   ❌ Deployment failed:', error.message);
      return;
    }
    
    console.log('\n' + '═'.repeat(50));
    console.log('✅ FILTERING FIX DEPLOYED SUCCESSFULLY');
    console.log('\nChanges deployed:');
    console.log('• Fixed import path in movie handler');
    console.log('• Updated content-filter-service with complete genre mapping');
    console.log('• Fixed TV genre filtering (Animation + Comedy should now work)');
    console.log('• Improved content relevance with proper genre mapping');
    
    console.log('\n🧪 Next steps:');
    console.log('• Test the filtering with: node debug-filtering-issue.js');
    console.log('• Verify content relevance has improved');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
  } finally {
    // Return to root directory
    process.chdir('..');
  }
}

// Run the deployment
deployFilteringFix().catch(console.error);
