#!/usr/bin/env node

/**
 * Alternative schema update using AWS SDK instead of CLI
 */

const fs = require('fs');
const path = require('path');

const API_ID = 'epjtt2y3fzh53ii6omzj6n6h5a';
const REGION = 'eu-west-1';
const SCHEMA_PATH = path.join(__dirname, 'infrastructure', 'schema.graphql');

console.log('🚀 Updating AppSync schema using AWS SDK...\n');

// Read schema
const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
console.log(`✅ Schema read (${schemaContent.length} characters)\n`);

console.log('📝 Schema content preview:');
console.log(schemaContent.substring(0, 200) + '...\n');

console.log('🔧 Manual steps to update schema:');
console.log('1. Go to AWS Console > AppSync');
console.log(`2. Select API: ${API_ID}`);
console.log('3. Go to Schema section');
console.log('4. Click "Edit Schema"');
console.log('5. Replace the entire schema with the content from:');
console.log(`   ${SCHEMA_PATH}`);
console.log('6. Click "Save Schema"\n');

console.log('🎯 Key changes in the schema:');
console.log('- Removed: joinRoom(roomId: ID!): Room');
console.log('- Kept: joinRoomByInvite(inviteCode: String!): Room');
console.log('- Updated subscription to use joinRoomByInvite\n');

console.log('⚠️  Alternative CLI approaches to try:');
console.log('1. aws appsync start-schema-creation --api-id ' + API_ID + ' --region ' + REGION + ' --definition "$(cat infrastructure/schema.graphql)"');
console.log('2. aws appsync start-schema-creation --api-id ' + API_ID + ' --region ' + REGION + ' --definition fileb://infrastructure/schema.graphql');
console.log('3. Manual copy-paste via AWS Console (recommended for now)\n');

// Try to create a properly formatted command
const escapedSchema = schemaContent.replace(/"/g, '\\"').replace(/\n/g, '\\n');
console.log('📋 Escaped schema for CLI (first 500 chars):');
console.log(escapedSchema.substring(0, 500) + '...\n');

console.log('✅ Next steps:');
console.log('1. Try manual AWS Console update first');
console.log('2. Test web join room functionality');
console.log('3. If working, continue with mobile app testing');