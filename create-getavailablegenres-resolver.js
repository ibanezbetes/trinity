/**
 * Create getAvailableGenres resolver for trinity-api-dev
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const appsync = new AWS.AppSync();

const API_ID = 'yeirvhh7tbasposxcefngulg6i'; // trinity-api-dev
const DATA_SOURCE_NAME = 'MovieDataSource';

async function createGetAvailableGenresResolver() {
  console.log('🔧 Creating getAvailableGenres resolver...\n');

  const requestMappingTemplate = `{
    "version": "2017-02-28",
    "operation": "Invoke",
    "payload": {
        "info": {
            "fieldName": "getAvailableGenres"
        },
        "arguments": $util.toJson($context.arguments),
        "identity": $util.toJson($context.identity),
        "source": $util.toJson($context.source),
        "request": $util.toJson($context.request)
    }
}`;

  const responseMappingTemplate = `$util.toJson($context.result)`;

  try {
    const params = {
      apiId: API_ID,
      typeName: 'Query',
      fieldName: 'getAvailableGenres',
      dataSourceName: DATA_SOURCE_NAME,
      requestMappingTemplate,
      responseMappingTemplate,
      kind: 'UNIT'
    };

    console.log('📡 Creating resolver with params:');
    console.log(`   API ID: ${API_ID}`);
    console.log(`   Type: Query`);
    console.log(`   Field: getAvailableGenres`);
    console.log(`   Data Source: ${DATA_SOURCE_NAME}`);

    const result = await appsync.createResolver(params).promise();
    
    console.log('\n✅ Resolver created successfully!');
    console.log('Resolver ARN:', result.resolver.resolverArn);
    
    console.log('\n🎉 getAvailableGenres resolver is now available!');
    console.log('\n📱 Next steps:');
    console.log('   1. Restart the mobile app');
    console.log('   2. Test dynamic genre selection');
    console.log('   3. Switch between "Películas" and "Series"');
    
  } catch (error) {
    if (error.code === 'ConflictException') {
      console.log('⚠️ Resolver already exists, updating it...');
      
      try {
        const updateParams = {
          apiId: API_ID,
          typeName: 'Query',
          fieldName: 'getAvailableGenres',
          dataSourceName: DATA_SOURCE_NAME,
          requestMappingTemplate,
          responseMappingTemplate,
          kind: 'UNIT'
        };
        
        const updateResult = await appsync.updateResolver(updateParams).promise();
        console.log('✅ Resolver updated successfully!');
        console.log('Resolver ARN:', updateResult.resolver.resolverArn);
        
      } catch (updateError) {
        console.error('❌ Error updating resolver:', updateError.message);
      }
    } else {
      console.error('❌ Error creating resolver:', error.message);
    }
  }
}

// Run the script
createGetAvailableGenresResolver().catch(console.error);
