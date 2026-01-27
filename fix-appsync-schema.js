const fs = require('fs');
const path = require('path');

async function fixAppSyncSchema() {
  console.log('🔧 Fixing AppSync GraphQL schema for getFilteredContent...');
  
  try {
    // Read current schema
    const schemaPath = path.join(__dirname, 'current-schema.graphql');
    let schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📖 Current schema loaded');
    
    // Check current Movie type definition
    const movieTypeMatch = schema.match(/type Movie \{[^}]+\}/s);
    if (movieTypeMatch) {
      console.log('📊 Current Movie type:');
      console.log(movieTypeMatch[0]);
    }
    
    // Define the correct FilteredContent type that matches Lambda output
    const filteredContentType = `
# Filtered content type that matches Lambda response format
type FilteredContent {
  id: String!
  tmdbId: Int
  title: String!
  originalTitle: String
  overview: String
  posterPath: String
  backdropPath: String
  releaseDate: String
  year: String
  rating: Float
  voteCount: Int
  genres: [String!]
  mediaType: String
  runtime: Int
  tagline: String
  budget: Int
  revenue: Int
  trailerKey: String
  watchProviders: [WatchProvider]
  cast: [CastMember]
  director: String
  creator: String
}

# Supporting types for FilteredContent
type WatchProvider {
  id: Int!
  name: String!
  logoPath: String
  type: String
}

type CastMember {
  id: Int!
  name: String!
  character: String
  profilePath: String
}`;
    
    // Update the getFilteredContent query to return the correct type
    const updatedQuery = `  getFilteredContent(excludeIds: [String!], genreIds: [Int!]!, limit: Int, mediaType: MediaType!): [FilteredContent]`;
    
    // Find and replace the current getFilteredContent definition
    const currentQueryPattern = /getFilteredContent\([^)]+\):\s*\[Movie\]/;
    
    if (schema.match(currentQueryPattern)) {
      console.log('✅ Found current getFilteredContent definition');
      
      // Replace the query definition
      schema = schema.replace(currentQueryPattern, updatedQuery);
      
      // Add the new types before the existing types (after schema definition)
      const schemaDefEnd = schema.indexOf('interface BaseEvent');
      if (schemaDefEnd !== -1) {
        schema = schema.slice(0, schemaDefEnd) + filteredContentType + '\n\n' + schema.slice(schemaDefEnd);
      } else {
        // Fallback: add after schema definition
        const afterSchema = schema.indexOf('}\n\n') + 3;
        schema = schema.slice(0, afterSchema) + filteredContentType + '\n\n' + schema.slice(afterSchema);
      }
      
      console.log('✅ Schema updated with correct types');
      
    } else {
      console.log('❌ Could not find getFilteredContent definition to update');
      return;
    }
    
    // Write the updated schema
    const updatedSchemaPath = path.join(__dirname, 'updated-schema-filtered-content.graphql');
    fs.writeFileSync(updatedSchemaPath, schema);
    
    console.log(`✅ Updated schema written to: ${updatedSchemaPath}`);
    
    // Show the changes made
    console.log('\n📊 Changes made:');
    console.log('1. ✅ Added FilteredContent type that matches Lambda response format');
    console.log('2. ✅ Added WatchProvider and CastMember supporting types');
    console.log('3. ✅ Updated getFilteredContent query to return [FilteredContent] instead of [Movie]');
    
    console.log('\n📝 Next steps:');
    console.log('1. Deploy this updated schema to AppSync');
    console.log('2. Verify that the resolver mapping is correct');
    console.log('3. Test the mobile app to confirm it receives filtered content');
    
    // Create a deployment script
    const deployScript = `
# AppSync Schema Deployment Script
# 
# To deploy this schema to AppSync, you can use:
# 1. AWS CLI:
#    aws appsync update-type --api-id qdvhkkwneza2pkpaofehnvmubq --type-name Query --definition file://updated-schema-filtered-content.graphql
#
# 2. AWS Console:
#    - Go to AppSync console
#    - Select your API (qdvhkkwneza2pkpaofehnvmubq)
#    - Go to Schema section
#    - Replace the schema with the content from updated-schema-filtered-content.graphql
#    - Save and deploy
#
# 3. CDK (if available):
#    - Update the schema file in your CDK stack
#    - Run cdk deploy

echo "Schema deployment options:"
echo "1. AWS Console (recommended for quick fix)"
echo "2. AWS CLI (if you have permissions)"
echo "3. CDK (if stack is available)"
`;
    
    fs.writeFileSync(path.join(__dirname, 'deploy-schema-instructions.txt'), deployScript);
    
    console.log('\n📋 Summary:');
    console.log('✅ Schema fix prepared successfully');
    console.log('✅ The issue was: getFilteredContent returned [Movie] but Lambda provides different format');
    console.log('✅ Solution: Created FilteredContent type that matches Lambda response exactly');
    console.log('✅ This should fix the mobile app receiving 0 items from getFilteredContent');
    
    return {
      success: true,
      updatedSchemaPath,
      changes: [
        'Added FilteredContent type',
        'Added WatchProvider and CastMember types',
        'Updated getFilteredContent return type'
      ]
    };
    
  } catch (error) {
    console.error('❌ Error fixing AppSync schema:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the fix
fixAppSyncSchema()
  .then(result => {
    console.log('\n📋 Fix Result:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(console.error);
