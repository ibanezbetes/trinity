#!/usr/bin/env node

/**
 * Test the duplicates fix in content filtering
 * This script tests that excludeIds properly prevents duplicate content
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });

const lambda = new AWS.Lambda();

console.log('🧪 Testing duplicates fix in content filtering...');

async function testDuplicatesPrevention() {
  try {
    console.log('');
    console.log('🎬 Step 1: Getting initial TV content...');
    
    // Get initial content
    const initialEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: { 
        mediaType: 'TV', 
        genreIds: [16, 35], // Animation + Comedy for TV
        limit: 5,
        excludeIds: []
      }
    };
    
    const initialResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(initialEvent)
    }).promise();
    
    const initialResponse = JSON.parse(initialResult.Payload);
    
    if (initialResult.StatusCode === 200 && !initialResponse.errorMessage && initialResponse.length > 0) {
      console.log('✅ Initial content loaded successfully!');
      console.log(`📊 Found ${initialResponse.length} TV items`);
      
      // Extract IDs from initial response
      const initialIds = initialResponse.map(item => item.id);
      console.log(`🔍 Initial IDs: [${initialIds.join(', ')}]`);
      
      console.log('');
      console.log('🚫 Step 2: Getting content with exclusions...');
      
      // Test with exclusions
      const excludeEvent = {
        info: { fieldName: 'getFilteredContent' },
        arguments: { 
          mediaType: 'TV', 
          genreIds: [16, 35], // Same genres
          limit: 5,
          excludeIds: initialIds // Exclude the IDs we just got
        }
      };
      
      const excludeResult = await lambda.invoke({
        FunctionName: 'trinity-movie-dev',
        Payload: JSON.stringify(excludeEvent)
      }).promise();
      
      const excludeResponse = JSON.parse(excludeResult.Payload);
      
      if (excludeResult.StatusCode === 200 && !excludeResponse.errorMessage) {
        console.log('✅ Excluded content loaded successfully!');
        console.log(`📊 Found ${excludeResponse.length} TV items (after exclusions)`);
        
        if (excludeResponse.length > 0) {
          const excludedIds = excludeResponse.map(item => item.id);
          console.log(`🔍 Excluded IDs: [${excludedIds.join(', ')}]`);
          
          // Check for duplicates
          const duplicates = initialIds.filter(id => excludedIds.includes(id));
          
          if (duplicates.length === 0) {
            console.log('✅ SUCCESS: No duplicates found! Exclusion is working correctly.');
          } else {
            console.log(`❌ FAILURE: Found ${duplicates.length} duplicates: [${duplicates.join(', ')}]`);
          }
          
          // Show sample titles
          console.log('');
          console.log('📋 Sample content comparison:');
          console.log('Initial batch:');
          initialResponse.slice(0, 3).forEach((item, i) => {
            console.log(`  ${i+1}. ${item.title} (${item.id})`);
          });
          
          console.log('Excluded batch:');
          excludeResponse.slice(0, 3).forEach((item, i) => {
            console.log(`  ${i+1}. ${item.title} (${item.id})`);
          });
          
        } else {
          console.log('⚠️ No content returned after exclusions - this might indicate all content was filtered out');
        }
      } else {
        console.log('❌ Excluded content failed:', excludeResponse.errorMessage || 'Unknown error');
      }
      
    } else {
      console.log('❌ Initial content failed:', initialResponse.errorMessage || 'Unknown error');
    }
    
    console.log('');
    console.log('🎉 Duplicates prevention test completed!');
    console.log('');
    console.log('📱 Next steps:');
    console.log('1. Open the mobile app');
    console.log('2. Create a room and start voting');
    console.log('3. Verify that no duplicate titles appear');
    console.log('4. Check that you never see "Ya has votado por esta película" error');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ResourceNotFoundException') {
      console.log('');
      console.log('💡 Make sure the Lambda function name is correct: trinity-movie-dev');
    }
    
    process.exit(1);
  }
}

testDuplicatesPrevention();
