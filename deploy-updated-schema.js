#!/usr/bin/env node

/**
 * Deploy Updated GraphQL Schema to AppSync
 * 
 * This script deploys the updated schema with FilteredContent type
 * to fix the mobile app's getFilteredContent query validation errors.
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const appsync = new AWS.AppSync();

async function deploySchema() {
  try {
    console.log('🚀 Starting AppSync schema deployment...');

    // Read the updated schema
    const schemaPath = path.join(__dirname, 'updated-schema-filtered-content.graphql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    const schemaDefinition = fs.readFileSync(schemaPath, 'utf8');
    console.log(`📄 Schema loaded: ${schemaDefinition.length} characters`);

    // Get AppSync API ID from environment or config
    const apiId = process.env.APPSYNC_API_ID || 'your-api-id-here';
    
    if (apiId === 'your-api-id-here') {
      console.error('❌ Please set APPSYNC_API_ID environment variable');
      console.log('💡 You can find your API ID in the AWS AppSync Console');
      process.exit(1);
    }

    console.log(`🎯 Deploying to AppSync API: ${apiId}`);

    // Deploy the schema
    const params = {
      apiId: apiId,
      definition: schemaDefinition
    };

    console.log('⏳ Updating schema...');
    const result = await appsync.startSchemaCreation(params).promise();
    
    console.log('✅ Schema deployment initiated!');
    console.log('📋 Status:', result.status);
    
    // Wait for schema creation to complete
    console.log('⏳ Waiting for schema deployment to complete...');
    
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      try {
        const statusResult = await appsync.getSchemaCreationStatus({
          apiId: apiId
        }).promise();
        
        console.log(`📊 Deployment status: ${statusResult.status}`);
        
        if (statusResult.status === 'SUCCESS') {
          console.log('🎉 Schema deployment completed successfully!');
          console.log('✅ The mobile app should now work with getFilteredContent');
          return;
        } else if (statusResult.status === 'FAILED') {
          console.error('❌ Schema deployment failed!');
          console.error('📋 Details:', statusResult.details);
          process.exit(1);
        }
        
        attempts++;
      } catch (statusError) {
        console.warn('⚠️ Could not check status:', statusError.message);
        attempts++;
      }
    }
    
    console.warn('⏰ Deployment status check timed out after 5 minutes');
    console.log('💡 Please check the AppSync Console for deployment status');

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

// Run the deployment
deploySchema();
