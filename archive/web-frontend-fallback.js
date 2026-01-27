#!/usr/bin/env node

/**
 * Fallback solution: Revert web frontend to use old joinRoom mutation
 * Use this if the schema still has the old mutation format
 */

const fs = require('fs');
const path = require('path');

const WEB_APP_PATH = path.join(__dirname, 'infrastructure', 'web', 'test-app.html');

console.log('🔄 Creating fallback web frontend for old schema...\n');

// Read current web app
let webAppContent = fs.readFileSync(WEB_APP_PATH, 'utf-8');

// Revert the mutation to use old format
const oldMutation = `                const data = await graphqlRequest(\`
                    mutation JoinRoom($input: JoinRoomInput!) {
                        joinRoom(input: $input) {
                            id
                            name
                            description
                            status
                            hostId
                            inviteCode
                            memberCount
                            createdAt
                        }
                    }
                \`, { input: { inviteCode } });`;

const newMutation = `                const data = await graphqlRequest(\`
                    mutation JoinRoomByInvite($inviteCode: String!) {
                        joinRoomByInvite(inviteCode: $inviteCode) {
                            id
                            name
                            description
                            status
                            hostId
                            inviteCode
                            memberCount
                            createdAt
                        }
                    }
                \`, { inviteCode });`;

// Check if we need to revert
if (webAppContent.includes('joinRoomByInvite')) {
    console.log('✅ Current web app uses joinRoomByInvite mutation');
    console.log('📝 Creating fallback version for old schema...\n');
    
    // Replace with old mutation
    const fallbackContent = webAppContent.replace(newMutation, oldMutation);
    
    // Also update the response parsing
    fallbackContent = fallbackContent.replace('const joinedRoom = data.joinRoomByInvite;', 'const joinedRoom = data.joinRoom;');
    
    // Save fallback version
    const fallbackPath = path.join(__dirname, 'infrastructure', 'web', 'test-app-fallback.html');
    fs.writeFileSync(fallbackPath, fallbackContent);
    
    console.log('✅ Fallback version created at:');
    console.log(`   ${fallbackPath}\n`);
    
    console.log('🔧 To use fallback version:');
    console.log('1. Copy test-app-fallback.html to test-app.html');
    console.log('2. Restart web server');
    console.log('3. Test join room functionality\n');
    
    console.log('📋 Fallback mutation format:');
    console.log('- Uses: joinRoom(input: JoinRoomInput!)');
    console.log('- Input: { input: { inviteCode } }');
    console.log('- Compatible with old schema\n');
    
} else {
    console.log('ℹ️  Web app already uses old joinRoom mutation format');
    console.log('✅ Should work with current schema\n');
}

console.log('🎯 Next steps:');
console.log('1. Test current web app first');
console.log('2. If it fails, use fallback version');
console.log('3. Continue with mobile app testing once web works');