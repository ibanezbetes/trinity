#!/usr/bin/env node

/**
 * Fix Resolver Mapping Template
 * 
 * Updates the getFilteredContent resolver to use the correct AppSync context structure
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const appsync = new AWS.AppSync();

async function fixResolverMapping() {
  try {
    console.log('🔧 Fixing getFilteredContent resolver mapping...');
    console.log('');

    const apiId = 'yeirvhh7tbasposxcefngulg6i';
    
    // Update the resolver with the correct request mapping template
    const updateParams = {
      apiId: apiId,
      typeName: 'Query',
      fieldName: 'getFilteredContent',
      dataSourceName: 'MovieDataSource',
      requestMappingTemplate: `{
    "version": "2017-02-28",
    "operation": "Invoke",
    "payload": {
        "info": {
            "fieldName": "getFilteredContent"
        },
        "arguments": $util.toJson($context.arguments),
        "identity": $util.toJson($context.identity),
        "source": $util.toJson($context.source),
        "request": $util.toJson($context.request)
    }
}`,
      responseMappingTemplate: `$util.toJson($context.result)`
    };

    console.log('📤 Updating resolver with correct mapping template...');
    
    const updateResult = await appsync.updateResolver(updateParams).promise();
    
    console.log('✅ Resolver updated successfully!');
    console.log('📋 Updated resolver details:');
    console.log(`  • Type: ${updateResult.resolver.typeName}`);
    console.log(`  • Field: ${updateResult.resolver.fieldName}`);
    console.log(`  • Data Source: ${updateResult.resolver.dataSourceName}`);
    
    console.log('');
    console.log('🔍 Request mapping template:');
    console.log(updateResult.resolver.requestMappingTemplate);
    
    console.log('');
    console.log('🎉 RESOLVER MAPPING FIXED!');
    console.log('');
    console.log('📱 The mobile app should now work correctly:');
    console.log('1. getFilteredContent will receive the correct fieldName');
    console.log('2. Lambda function will recognize the operation');
    console.log('3. Real TMDB movies will be returned');
    console.log('4. No more "Operación no soportada: undefined" errors');

  } catch (error) {
    console.error('❌ Failed to fix resolver mapping:', error);
    process.exit(1);
  }
}

fixResolverMapping();
