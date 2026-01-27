@echo off
echo ========================================
echo Final Lambda Fix - Clean Code
echo ========================================
echo.

echo Setting AWS credentials...
set AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
set AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
set AWS_DEFAULT_REGION=eu-west-1

echo Step 1: Installing uuid in infrastructure...
cd infrastructure
call npm install

echo.
echo Step 2: Creating zip package...
if exist lambda-final.zip del lambda-final.zip
powershell -Command "Compress-Archive -Path room.js,node_modules,package.json -DestinationPath lambda-final.zip -Force"

echo.
echo Step 3: Updating Lambda function...
aws lambda update-function-code ^
    --function-name trinity-room-dev ^
    --zip-file fileb://lambda-final.zip ^
    --region eu-west-1

echo.
echo Cleanup...
del lambda-final.zip

cd ..
echo.
echo ========================================
echo Done! Lambda updated with clean code
echo ========================================
echo.
echo Now test creating a room!
pause