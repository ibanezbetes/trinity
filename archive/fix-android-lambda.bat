@echo off
echo ========================================
echo Fixing Lambda for Android App
echo ========================================
echo.

echo Setting AWS credentials...
set AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
set AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
set AWS_DEFAULT_REGION=eu-west-1

echo Step 1: Installing dependencies in infrastructure...
cd infrastructure
call npm install

echo.
echo Step 2: Compiling TypeScript (ignoring errors)...
call npx tsc --skipLibCheck --noEmit false --outDir dist

echo.
echo Step 3: Copying node_modules to dist...
if not exist dist\node_modules mkdir dist\node_modules
xcopy /E /I /Y node_modules\uuid dist\node_modules\uuid
xcopy /E /I /Y node_modules\@aws-sdk dist\node_modules\@aws-sdk

echo.
echo Step 4: Creating deployment package...
cd dist
if exist lambda-android.zip del lambda-android.zip
powershell -Command "Compress-Archive -Path * -DestinationPath lambda-android.zip -Force"

echo.
echo Step 5: Updating Lambda function...
aws lambda update-function-code ^
    --function-name trinity-room-dev ^
    --zip-file fileb://lambda-android.zip ^
    --region eu-west-1

echo.
echo Cleanup...
del lambda-android.zip

cd ..\..
echo.
echo ========================================
echo Done! Lambda ready for Android app
echo ========================================
echo.
echo Now test creating a room from Android!
pause