@echo off
REM Script para crear Subscription Resolvers en AppSync usando AWS CLI
REM Fecha: 15 de Enero de 2026

setlocal enabledelayedexpansion

set REGION=eu-west-1
set API_ID=epjtt2y3fzh53ii6omzj6n6h5a

echo.
echo ================================================
echo 🚀 Creando Subscription Resolvers para AppSync
echo ================================================
echo API ID: %API_ID%
echo Region: %REGION%
echo.

REM 1. Crear Data Source "None"
echo 📊 Paso 1: Creando Data Source 'None'...
echo.

aws appsync create-data-source ^
  --api-id %API_ID% ^
  --name NoneDataSource ^
  --type NONE ^
  --region %REGION% ^
  --description "Data source for real-time subscriptions" ^
  2>nul || echo ⚠️  Data Source ya existe (ignorando error)

echo ✅ Data Source creado/verificado
echo.

REM 2. Crear Resolvers para cada subscription
echo 🔗 Paso 2: Creando Resolvers para Subscriptions...
echo.

set SUCCESS_COUNT=0
set SKIP_COUNT=0
set ERROR_COUNT=0

REM Request y Response templates
set REQUEST_TEMPLATE={"version":"2017-02-28","payload":{}}
set RESPONSE_TEMPLATE=$util.toJson($context.result)

REM Lista de subscriptions
set SUBSCRIPTIONS=onVoteUpdate onMatchFound onMemberUpdate onVoteUpdateEnhanced onMatchFoundEnhanced onConnectionStatusChange onRoomStateSync

for %%S in (%SUBSCRIPTIONS%) do (
  echo    Creando resolver para: %%S
  
  aws appsync create-resolver ^
    --api-id %API_ID% ^
    --type-name Subscription ^
    --field-name %%S ^
    --data-source-name NoneDataSource ^
    --request-mapping-template "%REQUEST_TEMPLATE%" ^
    --response-mapping-template "%RESPONSE_TEMPLATE%" ^
    --region %REGION% ^
    2>nul && (
      echo       ✅ Creado exitosamente
      set /a SUCCESS_COUNT+=1
    ) || (
      echo       ⚠️  Ya existe o error (continuando)
      set /a SKIP_COUNT+=1
    )
  
  echo.
)

REM 3. Verificar
echo ================================================
echo 📊 RESUMEN
echo ================================================
echo ✅ Creados: %SUCCESS_COUNT%
echo ⚠️  Saltados: %SKIP_COUNT%
echo.

echo 🔍 Verificando Subscription Resolvers...
aws appsync list-resolvers ^
  --api-id %API_ID% ^
  --type-name Subscription ^
  --region %REGION% ^
  --query "length(resolvers)" ^
  --output text > temp_count.txt

set /p RESOLVER_COUNT=<temp_count.txt
del temp_count.txt

echo Total de Subscription Resolvers: %RESOLVER_COUNT%
echo.

if %RESOLVER_COUNT% GEQ 7 (
  echo 🎉 ¡ÉXITO! Todos los Subscription Resolvers están configurados
  echo.
  echo ✅ El sistema de votación en tiempo real ahora debería funcionar
  echo.
  echo 📝 Próximos pasos:
  echo    1. Probar desde la app móvil
  echo    2. Crear una sala con dos usuarios
  echo    3. Votar desde un usuario
  echo    4. Verificar que el otro usuario recibe la actualización
  echo.
) else (
  echo ⚠️  ADVERTENCIA: Solo se crearon %RESOLVER_COUNT% resolvers
  echo.
)

echo ================================================
echo ✅ Script completado
echo ================================================
echo.

endlocal
