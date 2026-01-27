@echo off
echo ========================================
echo Fixing Lambda UUID Error - With ENV
echo ========================================
echo.

echo Setting AWS credentials...
set AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
set AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
set AWS_DEFAULT_REGION=eu-west-1

echo Step 1: Creating simple Lambda handler with uuid...
cd infrastructure

echo Creating room.js with uuid dependency...
echo const { v4: uuidv4 } = require('uuid'); > room.js
echo. >> room.js
echo exports.handler = async (event) => { >> room.js
echo   console.log('Event:', JSON.stringify(event)); >> room.js
echo   const roomId = uuidv4(); >> room.js
echo   return { >> room.js
echo     statusCode: 200, >> room.js
echo     body: JSON.stringify({ >> room.js
echo       id: roomId, >> room.js
echo       name: event.arguments.name, >> room.js
echo       inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(), >> room.js
echo       hostId: event.identity.sub, >> room.js
echo       memberCount: 1, >> room.js
echo       status: 'active', >> room.js
echo       createdAt: new Date().toISOString() >> room.js
echo     }) >> room.js
echo   }; >> room.js
echo }; >> room.js

echo.
echo Step 2: Creating package.json...
echo { > package.json
echo   "name": "lambda-handler", >> package.json
echo   "version": "1.0.0", >> package.json
echo   "dependencies": { >> package.json
echo     "uuid": "^9.0.0" >> package.json
echo   } >> package.json
echo } >> package.json

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
echo Done! Lambda function updated with uuid
echo ========================================
echo.
echo Now test creating a room!
pause