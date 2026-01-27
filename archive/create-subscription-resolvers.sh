#!/bin/bash

# Script para crear Subscription Resolvers en AppSync usando AWS CLI
# Fecha: 15 de Enero de 2026

set -e  # Salir si hay algún error

REGION="eu-west-1"
API_ID="epjtt2y3fzh53ii6omzj6n6h5a"

echo "🚀 Creando Subscription Resolvers para AppSync"
echo "================================================"
echo "API ID: $API_ID"
echo "Región: $REGION"
echo ""

# 1. Crear Data Source "None" para subscriptions
echo "📊 Paso 1: Creando Data Source 'None'..."

aws appsync create-data-source \
  --api-id "$API_ID" \
  --name "NoneDataSource" \
  --type "NONE" \
  --region "$REGION" \
  --description "Data source for real-time subscriptions" \
  2>/dev/null || echo "⚠️  Data Source ya existe (ignorando error)"

echo "✅ Data Source creado/verificado"
echo ""

# 2. Crear Request Mapping Template (común para todas las subscriptions)
REQUEST_TEMPLATE='{
  "version": "2017-02-28",
  "payload": {}
}'

# 3. Crear Response Mapping Template (común para todas las subscriptions)
RESPONSE_TEMPLATE='$util.toJson($context.result)'

# 4. Lista de subscriptions a crear
SUBSCRIPTIONS=(
  "onVoteUpdate"
  "onMatchFound"
  "onMemberUpdate"
  "onVoteUpdateEnhanced"
  "onMatchFoundEnhanced"
  "onConnectionStatusChange"
  "onRoomStateSync"
)

# 5. Crear resolver para cada subscription
echo "🔗 Paso 2: Creando Resolvers para Subscriptions..."
echo ""

SUCCESS_COUNT=0
SKIP_COUNT=0
ERROR_COUNT=0

for SUBSCRIPTION in "${SUBSCRIPTIONS[@]}"; do
  echo "   Creando resolver para: $SUBSCRIPTION"
  
  # Intentar crear el resolver
  RESULT=$(aws appsync create-resolver \
    --api-id "$API_ID" \
    --type-name "Subscription" \
    --field-name "$SUBSCRIPTION" \
    --data-source-name "NoneDataSource" \
    --request-mapping-template "$REQUEST_TEMPLATE" \
    --response-mapping-template "$RESPONSE_TEMPLATE" \
    --region "$REGION" \
    2>&1) || true
  
  if echo "$RESULT" | grep -q "ConflictException"; then
    echo "      ⚠️  Ya existe (saltando)"
    ((SKIP_COUNT++))
  elif echo "$RESULT" | grep -q "arn:aws:appsync"; then
    echo "      ✅ Creado exitosamente"
    ((SUCCESS_COUNT++))
  else
    echo "      ❌ Error: $RESULT"
    ((ERROR_COUNT++))
  fi
  
  echo ""
done

# 6. Resumen
echo "================================================"
echo "📊 RESUMEN DE CREACIÓN"
echo "================================================"
echo "✅ Creados exitosamente: $SUCCESS_COUNT"
echo "⚠️  Ya existían: $SKIP_COUNT"
echo "❌ Errores: $ERROR_COUNT"
echo ""

# 7. Verificar que se crearon
echo "🔍 Verificando Subscription Resolvers..."
RESOLVER_COUNT=$(aws appsync list-resolvers \
  --api-id "$API_ID" \
  --type-name "Subscription" \
  --region "$REGION" \
  --query 'length(resolvers)' \
  --output text)

echo "Total de Subscription Resolvers: $RESOLVER_COUNT"
echo ""

if [ "$RESOLVER_COUNT" -ge 7 ]; then
  echo "🎉 ¡ÉXITO! Todos los Subscription Resolvers están configurados"
  echo ""
  echo "✅ El sistema de votación en tiempo real ahora debería funcionar"
  echo ""
  echo "📝 Próximos pasos:"
  echo "   1. Probar desde la app móvil"
  echo "   2. Crear una sala con dos usuarios"
  echo "   3. Votar desde un usuario"
  echo "   4. Verificar que el otro usuario recibe la actualización en tiempo real"
  echo ""
else
  echo "⚠️  ADVERTENCIA: Solo se crearon $RESOLVER_COUNT resolvers (se esperaban 7)"
  echo ""
  echo "Ejecuta este comando para ver los detalles:"
  echo "aws appsync list-resolvers --api-id $API_ID --type-name Subscription --region $REGION"
  echo ""
fi

echo "================================================"
echo "✅ Script completado"
echo "================================================"
