/**
 * Simple test to check what getRoom returns
 */

// Test room ID from the logs
const TEST_ROOM_ID = '3da5f318-475d-4f65-b4ca-11e07b0135fd';

console.log('🔍 Testing getRoom response structure...');
console.log('Room ID:', TEST_ROOM_ID);

// Simulate what the mobile app should see
console.log('\\nExpected filtering check:');
console.log('if (room && room.mediaType && room.genreIds && room.genreIds.length > 0)');

console.log('\\nFrom the creation logs, we know the room was created with:');
console.log('- mediaType: "MOVIE"');
console.log('- genreIds: [12, 878]');
console.log('- genreNames: ["Aventura", "Ciencia ficción"]');

console.log('\\nBut the getRoom response seems to be missing these fields.');
console.log('This suggests either:');
console.log('1. The backend resolver is not returning the fields');
console.log('2. The fields are null/undefined in the database');
console.log('3. There is a field mapping issue');

console.log('\\nNext steps:');
console.log('1. Check the mobile app logs with the new debug output');
console.log('2. Verify the backend resolver is working correctly');
console.log('3. Check if the room was actually saved with filtering fields');
