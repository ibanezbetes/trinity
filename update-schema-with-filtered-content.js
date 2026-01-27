#!/usr/bin/env node

/**
 * Update AppSync Schema with FilteredContent Type
 * 
 * This script updates the AppSync schema to include the FilteredContent type
 * that matches the Lambda response format, fixing mobile app validation errors.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function updateSchema() {
  try {
    console.log('🚀 Updating AppSync schema with FilteredContent type...');

    // Check if AWS CLI is available
    try {
      execSync('aws --version', { stdio: 'pipe' });
      console.log('✅ AWS CLI is available');
    } catch (error) {
      console.error('❌ AWS CLI not found. Please install AWS CLI first.');
      process.exit(1);
    }

    // Check if schema file exists
    const schemaPath = path.join(__dirname, 'updated-schema-filtered-content.graphql');
    
    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ Schema file not found: ${schemaPath}`);
      process.exit(1);
    }

    console.log('📄 Schema file found, preparing update...');

    // Get current AppSync APIs to help user identify the correct one
    console.log('🔍 Finding AppSync APIs...');
    
    try {
      const listResult = execSync('aws appsync list-graphql-apis --region us-east-1', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const apis = JSON.parse(listResult);
      
      if (apis.graphqlApis && apis.graphqlApis.length > 0) {
        console.log('📋 Available AppSync APIs:');
        apis.graphqlApis.forEach((api, index) => {
          console.log(`  ${index + 1}. ${api.name} (${api.apiId})`);
        });
        
        // Try to find Trinity API
        const trinityApi = apis.graphqlApis.find(api => 
          api.name.toLowerCase().includes('trinity') || 
          api.name.toLowerCase().includes('room') ||
          api.name.toLowerCase().includes('movie')
        );
        
        if (trinityApi) {
          console.log(`🎯 Found likely Trinity API: ${trinityApi.name} (${trinityApi.apiId})`);
          
          // Update the schema
          console.log('⏳ Updating schema...');
          
          const updateCommand = `aws appsync start-schema-creation --api-id ${trinityApi.apiId} --definition file://${schemaPath} --region us-east-1`;
          
          console.log('📤 Executing:', updateCommand);
          
          const updateResult = execSync(updateCommand, { 
            encoding: 'utf8',
            stdio: 'pipe'
          });
          
          const result = JSON.parse(updateResult);
          console.log('✅ Schema update initiated!');
          console.log('📋 Status:', result.status);
          
          // Wait for completion
          console.log('⏳ Waiting for schema update to complete...');
          
          let attempts = 0;
          const maxAttempts = 30;
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            try {
              const statusCommand = `aws appsync get-schema-creation-status --api-id ${trinityApi.apiId} --region us-east-1`;
              const statusResult = execSync(statusCommand, { 
                encoding: 'utf8',
                stdio: 'pipe'
              });
              
              const status = JSON.parse(statusResult);
              console.log(`📊 Status: ${status.status}`);
              
              if (status.status === 'SUCCESS') {
                console.log('🎉 Schema update completed successfully!');
                console.log('✅ Mobile app getFilteredContent should now work!');
                console.log('');
                console.log('🔄 Next steps:');
                console.log('1. Test the mobile app - create a new room with genre preferences');
                console.log('2. Verify that real TMDB movies appear (not mock movies)');
                console.log('3. Check that genre filtering works correctly');
                return;
              } else if (status.status === 'FAILED') {
                console.error('❌ Schema update failed!');
                if (status.details) {
                  console.error('📋 Error details:', status.details);
                }
                process.exit(1);
              }
              
            } catch (statusError) {
              console.warn('⚠️ Could not check status, retrying...');
            }
            
            attempts++;
          }
          
          console.warn('⏰ Status check timed out. Please check AppSync Console manually.');
          
        } else {
          console.log('❓ Could not automatically identify Trinity API.');
          console.log('💡 Please run this command manually with your API ID:');
          console.log(`aws appsync start-schema-creation --api-id YOUR_API_ID --definition file://${schemaPath} --region us-east-1`);
        }
        
      } else {
        console.log('❓ No AppSync APIs found in us-east-1 region');
      }
      
    } catch (listError) {
      console.warn('⚠️ Could not list AppSync APIs:', listError.message);
      console.log('💡 Please run this command manually:');
      console.log(`aws appsync start-schema-creation --api-id YOUR_API_ID --definition file://${schemaPath} --region us-east-1`);
    }

  } catch (error) {
    console.error('❌ Schema update failed:', error.message);
    
    if (error.message.includes('credentials')) {
      console.log('💡 Please configure AWS credentials: aws configure');
    } else if (error.message.includes('region')) {
      console.log('💡 Please check your AWS region configuration');
    }
    
    process.exit(1);
  }
}

// Helper function for async sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the update
updateSchema().catch(console.error);
