#!/usr/bin/env node

/**
 * Create getFilteredContent Resolver
 * 
 * Creates the missing AppSync resolver for getFilteredContent field
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const appsync = new AWS.AppSync();

async function createFilteredContentResolver() {
  try {
    console.log('🔧 Creating getFilteredContent resolver...');
    console.log('');

    const apiId = 'yeirvhh7tbasposxcefngulg6i';
    
    // First, let's check what data sources are available
    console.log('📋 Checking available data sources...');
    
    const dataSourcesResult = await appsync.listDataSources({
      apiId: apiId
    }).promise();
    
    console.log('Available data sources:');
    dataSourcesResult.dataSources.forEach(ds => {
      console.log(`  • ${ds.name} (${ds.type})`);
    });
    
    // Find the MovieDataSource
    const movieDataSource = dataSourcesResult.dataSources.find(ds => 
      ds.name === 'MovieDataSource' || ds.name.toLowerCase().includes('movie')
    );
    
    if (!movieDataSource) {
      console.error('❌ MovieDataSource not found!');
      process.exit(1);
    }
    
    console.log(`✅ Using data source: ${movieDataSource.name}`);
    console.log('');

    // Create the resolver
    console.log('🔧 Creating resolver for getFilteredContent...');
    
    const resolverParams = {
      apiId: apiId,
      typeName: 'Query',
      fieldName: 'getFilteredContent',
      dataSourceName: movieDataSource.name,
      requestMappingTemplate: `{
    "version": "2017-02-28",
    "operation": "Invoke",
    "payload": {
        "field": "getFilteredContent",
        "arguments": $util.toJson($context.arguments),
        "identity": $util.toJson($context.identity),
        "source": $util.toJson($context.source),
        "request": $util.toJson($context.request)
    }
}`,
      responseMappingTemplate: `$util.toJson($context.result)`
    };

    const createResult = await appsync.createResolver(resolverParams).promise();
    
    console.log('✅ Resolver created successfully!');
    console.log('📋 Resolver details:');
    console.log(`  • Type: ${createResult.resolver.typeName}`);
    console.log(`  • Field: ${createResult.resolver.fieldName}`);
    console.log(`  • Data Source: ${createResult.resolver.dataSourceName}`);
    console.log(`  • ARN: ${createResult.resolver.resolverArn}`);
    
    console.log('');
    console.log('🎉 SUCCESS! getFilteredContent resolver is now active');
    console.log('');
    console.log('📱 Next steps:');
    console.log('1. Test the mobile app again');
    console.log('2. Create a new room with Animation + Comedy');
    console.log('3. Verify real TMDB movies appear');
    console.log('4. Check that filtering works correctly');

  } catch (error) {
    console.error('❌ Failed to create resolver:', error);
    
    if (error.code === 'ConflictException') {
      console.log('💡 Resolver already exists - this is actually good!');
      console.log('The issue might be elsewhere. Let me check the existing resolver...');
      
      try {
        const existingResolver = await appsync.getResolver({
          apiId: 'yeirvhh7tbasposxcefngulg6i',
          typeName: 'Query',
          fieldName: 'getFilteredContent'
        }).promise();
        
        console.log('📋 Existing resolver details:');
        console.log(`  • Data Source: ${existingResolver.resolver.dataSourceName}`);
        console.log(`  • Request Template: ${existingResolver.resolver.requestMappingTemplate}`);
        console.log(`  • Response Template: ${existingResolver.resolver.responseMappingTemplate}`);
        
      } catch (getError) {
        console.log('Could not get existing resolver details:', getError.message);
      }
    }
    
    process.exit(1);
  }
}

createFilteredContentResolver();
