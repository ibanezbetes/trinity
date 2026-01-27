@echo off
echo ========================================
echo Fixing Lambda Syntax Error
echo ========================================
echo.

echo Setting AWS credentials...
set AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
set AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
set AWS_DEFAULT_REGION=eu-west-1

echo Step 1: Creating correct Lambda handler...
cd infrastructure

echo Creating room.js with proper syntax...
(
echo const { v4: uuidv4 } = require('uuid'^);
echo.
echo exports.handler = async ^(event^) =^> {
echo   try {
echo     console.log^('Event:', JSON.stringify^(event^)^);
echo     
echo     const roomId = uuidv4^(^);
echo     const inviteCode = Math.random^(^).toString^(36^).substring^(2, 8^).toUpperCase^(^);
echo     
echo     const room = {
echo       id: roomId,
echo       name: event.arguments.name,
echo       inviteCode: inviteCode,
echo       hostId: event.identity.sub,
echo       memberCount: 1,
echo       status: 'active',
echo       createdAt: new Date^(^).toISOString^(^)
echo     };
echo     
echo     console.log^('Created room:', room^);
echo     
echo     return room;
echo   } catch ^(error^) {
echo     console.error^('Error:', error^);
echo     throw error;
echo   }
echo };
) > room.js

echo.
echo Step 2: Creating package.json...
(
echo {
echo   "name": "lambda-handler",
echo   "version": "1.0.0",
echo   "dependencies": {
echo     "uuid": "^9.0.0"
echo   }
echo }
) > package.json

echo.
echo Step 3: Installing uuid...
call npm install

echo.
echo Step 4: Creating zip package...
if exist lambda-fix.zip del lambda-fix.zip
powershell -Command "Compress-Archive -Path room.js,node_modules,package.json -DestinationPath lambda-fix.zip -Force"

echo.
echo Step 5: Updating Lambda function...
aws lambda update-function-code ^
    --function-name trinity-room-dev ^
    --zip-file fileb://lambda-fix.zip ^
    --region eu-west-1

echo.
echo Cleanup...
del room.js
del package.json
del lambda-fix.zip
rmdir /s /q node_modules

cd ..
echo.
echo ========================================
echo Done! Lambda syntax fixed
echo ========================================
echo.
echo Now test creating a room!
pause