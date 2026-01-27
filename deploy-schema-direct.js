#!/usr/bin/env node

/**
 * Deploy Schema Directly to AppSync
 * Uses AWS SDK to avoid file encoding issues
 */

const AWS = require('aws-sdk');
const fs = require('fs');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const appsync = new AWS.AppSync();

async function deploySchema() {
  try {
    console.log('🚀 Deploying schema to AppSync...');

    // Read the schema file
    const schemaDefinition = fs.readFileSync('updated-schema-filtered-content.graphql', 'utf8');
    console.log(`📄 Schema loaded: ${schemaDefinition.length} characters`);

    const apiId = 'yeirvhh7tbasposxcefngulg6i';
    console.log(`🎯 Deploying to API: ${apiId}`);

    // Start schema creation
    const params = {
      apiId: apiId,
      definition: schemaDefinition
    };

    console.log('⏳ Starting schema update...');
    const result = await appsync.startSchemaCreation(params).promise();
    
    console.log('✅ Schema update initiated!');
    console.log('📋 Status:', result.status);

    // Wait for completion
    console.log('⏳ Waiting for completion...');
    
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      try {
        const statusResult = await appsync.getSchemaCreationStatus({
          apiId: apiId
        }).promise();
        
        console.log(`📊 Status: ${statusResult.status}`);
        
        if (statusResult.status === 'SUCCESS') {
          console.log('🎉 Schema deployment completed successfully!');
          console.log('');
          console.log('✅ ADVANCED CONTENT FILTERING SYSTEM IS NOW ACTIVE!');
          console.log('');
          console.log('🔄 What this fixes:');
          console.log('  • Mobile app getFilteredContent query validation errors');
          console.log('  • FilteredContent type now matches Lambda response format');
          console.log('  • Real TMDB movies will display instead of mock movies');
          console.log('  • Genre filtering will work correctly');
          console.log('');
          console.log('📱 Next steps:');
          console.log('  1. Open the mobile app');
          console.log('  2. Create a new room with genre preferences (Comedy + Horror)');
          console.log('  3. Verify real TMDB movies appear');
          console.log('  4. Check that genre filtering works correctly');
          return;
        } else if (statusResult.status === 'FAILED') {
          console.error('❌ Schema deployment failed!');
          if (statusResult.details) {
            console.error('📋 Error details:', statusResult.details);
          }
          process.exit(1);
        }
        
      } catch (statusError) {
        console.warn('⚠️ Could not check status, retrying...');
      }
      
      attempts++;
    }
    
    console.warn('⏰ Status check timed out. Please check AppSync Console.');

  } catch (error) {
    console.error('❌ Schema deployment failed:', error);
    
    if (error.code === 'UnauthorizedOperation') {
      console.log('💡 Make sure your AWS credentials have AppSync permissions');
    } else if (error.code === 'NotFoundException') {
      console.log('💡 Check that the AppSync API ID is correct');
    }
    
    process.exit(1);
  }
}

deploySchema();
