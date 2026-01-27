@echo off
echo ========================================
echo Fixing Lambda UUID Error
echo ========================================
echo.

echo Step 1: Compiling TypeScript...
cd infrastructure
call npx tsc --skipLibCheck
if errorlevel 1 (
    echo Warning: TypeScript compilation had errors, continuing...
)
cd ..
echo.

echo Step 2: Packaging Lambda code...
cd infrastructure\dist\handlers
if exist lambda-package.zip del lambda-package.zip
powershell -Command "Compress-Archive -Path * -DestinationPath lambda-package.zip -Force"
echo.

echo Step 3: Updating Lambda function...
aws lambda update-function-code ^
    --function-name trinity-room-dev ^
    --zip-file fileb://lambda-package.zip ^
    --region eu-west-1

echo.
echo ========================================
echo Done! Lambda function updated
echo ========================================
echo.
echo Test creating a room now!
pause