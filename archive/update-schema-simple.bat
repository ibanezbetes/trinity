@echo off
echo ========================================
echo Actualizando Schema de AppSync
echo ========================================
echo.

echo Iniciando actualizacion del schema...
aws appsync start-schema-creation ^
  --api-id epjtt2y3fzh53ii6omzj6n6h5a ^
  --region eu-west-1 ^
  --definition file://infrastructure/schema.graphql

if %errorlevel% neq 0 (
    echo ERROR: Fallo al iniciar actualizacion
    pause
    exit /b 1
)

echo.
echo Esperando a que se complete la actualizacion...
timeout /t 5 /nobreak > nul

echo.
echo Verificando estado...
aws appsync get-schema-creation-status ^
  --api-id epjtt2y3fzh53ii6omzj6n6h5a ^
  --region eu-west-1

echo.
echo ========================================
echo ACTUALIZACION COMPLETADA
echo ========================================
pause
