
const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-west-1' });
const docClient = new AWS.DynamoDB.DocumentClient();

async function run() {
    const roomId = 'd424a8ef-d707-4474-a0f0-d7e7ae30a35f';
    console.log(`Checking Room: ${roomId}`);

    try {
        const res = await docClient.get({
            TableName: 'trinity-rooms-dev-v2',
            Key: { PK: roomId, SK: 'ROOM' }
        }).promise();

        if (res.Item) {
            console.log('✅ Room Found:');
            console.log(JSON.stringify(res.Item, null, 2));
        } else {
            console.log('❌ Room NOT Found');
        }
    } catch (err) {
        console.error('Error:', err);
    }
}
run();
