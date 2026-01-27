@echo off
echo ========================================
echo Desplegando Fix de Join Room
echo ========================================

echo Creando ZIP...
powershell Compress-Archive -Path handlers,services,utils -DestinationPath lambda-update.zip -Force

echo Desplegando a AWS Lambda...
aws lambda update-function-code --function-name trinity-room-dev --zip-file fileb://lambda-update.zip --region eu-west-1

echo Limpiando...
del lambda-update.zip

echo ========================================
echo Despliegue completado!
echo ========================================
pause