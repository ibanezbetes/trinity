/**
 * Script simplificado para verificar AppSync usando AWS CLI
 * NO requiere dependencias de Node.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuración
require('dotenv').config({ path: path.join(__dirname, '.env') });

const REGION = process.env.AWS_REGION || 'eu-west-1';
const APPSYNC_API_ID = process.env.APPSYNC_API_ID || 'epjtt2y3fzh53ii6omzj6n6h5a';

console.log('\n🔍 VERIFICACIÓN DE INFRAESTRUCTURA APPSYNC - TRINITY TFG');
console.log('='.repeat(60));
console.log(`Fecha: ${new Date().toISOString()}`);
console.log(`Región: ${REGION}`);
console.log(`AppSync API ID: ${APPSYNC_API_ID}`);

const report = {
  timestamp: new Date().toISOString(),
  region: REGION,
  appSyncApiId: APPSYNC_API_ID,
  results: {},
};

/**
 * Ejecutar comando AWS CLI y capturar resultado
 */
function runAWSCommand(command, description) {
  console.log(`\n${description}`);
  console.log('='.repeat(60));

  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parsed = JSON.parse(result);
    console.log('✅ Comando ejecutado exitosamente');
    return { success: true, data: parsed };
  } catch (error) {
    console.error('❌ Error ejecutando comando:', error.message);
    return { success: false, error: error.message };
  }
}

// 1. Verificar AppSync API
const appSyncResult = runAWSCommand(
  `aws appsync get-graphql-api --api-id ${APPSYNC_API_ID} --region ${REGION}`,
  '📡 Verificando AppSync API'
);

if (appSyncResult.success) {
  const api = appSyncResult.data.graphqlApi;
  console.log(`   Nombre: ${api.name}`);
  console.log(`   Endpoint: ${api.uris?.GRAPHQL || 'N/A'}`);
  console.log(`   Realtime: ${api.uris?.REALTIME || 'N/A'}`);
  console.log(`   Auth Type: ${api.authenticationType}`);
  report.results.appSyncAPI = { exists: true, api };
} else {
  report.results.appSyncAPI = { exists: false, error: appSyncResult.error };
}

// 2. Listar Data Sources
const dataSourcesResult = runAWSCommand(
  `aws appsync list-data-sources --api-id ${APPSYNC_API_ID} --region ${REGION}`,
  '📊 Listando Data Sources'
);

if (dataSourcesResult.success) {
  const dataSources = dataSourcesResult.data.dataSources || [];
  console.log(`   Encontrados: ${dataSources.length} Data Sources`);
  dataSources.forEach((ds, i) => {
    console.log(`   ${i + 1}. ${ds.name} (${ds.type})`);
  });
  report.results.dataSources = { count: dataSources.length, dataSources };
} else {
  report.results.dataSources = { count: 0, error: dataSourcesResult.error };
}

// 3. Listar Resolvers - Mutation
const mutationResolversResult = runAWSCommand(
  `aws appsync list-resolvers --api-id ${APPSYNC_API_ID} --type-name Mutation --region ${REGION}`,
  '🔗 Listando Resolvers (Mutation)'
);

if (mutationResolversResult.success) {
  const resolvers = mutationResolversResult.data.resolvers || [];
  console.log(`   Encontrados: ${resolvers.length} Mutation Resolvers`);
  resolvers.forEach((r) => {
    console.log(`   - ${r.fieldName} → ${r.dataSourceName || 'N/A'}`);
  });
  report.results.mutationResolvers = { count: resolvers.length, resolvers };
} else {
  report.results.mutationResolvers = { count: 0, error: mutationResolversResult.error };
}

// 4. Listar Resolvers - Subscription
const subscriptionResolversResult = runAWSCommand(
  `aws appsync list-resolvers --api-id ${APPSYNC_API_ID} --type-name Subscription --region ${REGION}`,
  '🔗 Listando Resolvers (Subscription)'
);

if (subscriptionResolversResult.success) {
  const resolvers = subscriptionResolversResult.data.resolvers || [];
  console.log(`   Encontrados: ${resolvers.length} Subscription Resolvers`);
  resolvers.forEach((r) => {
    console.log(`   - ${r.fieldName} → ${r.dataSourceName || 'N/A'}`);
  });
  report.results.subscriptionResolvers = { count: resolvers.length, resolvers };
} else {
  report.results.subscriptionResolvers = { count: 0, error: subscriptionResolversResult.error };
}

// 5. Listar Lambda Functions
const lambdaResult = runAWSCommand(
  `aws lambda list-functions --region ${REGION}`,
  '⚡ Listando Lambda Functions'
);

if (lambdaResult.success) {
  const allFunctions = lambdaResult.data.Functions || [];
  const trinityFunctions = allFunctions.filter((fn) => {
    const name = fn.FunctionName.toLowerCase();
    return (
      name.includes('trinity') ||
      name.includes('vote') ||
      name.includes('room') ||
      name.includes('realtime')
    );
  });

  console.log(`   Encontradas: ${trinityFunctions.length} Lambda Functions relacionadas`);
  trinityFunctions.forEach((fn, i) => {
    console.log(`   ${i + 1}. ${fn.FunctionName} (${fn.Runtime})`);
  });
  report.results.lambdaFunctions = { count: trinityFunctions.length, functions: trinityFunctions };
} else {
  report.results.lambdaFunctions = { count: 0, error: lambdaResult.error };
}

// 6. Listar DynamoDB Tables
const dynamoResult = runAWSCommand(
  `aws dynamodb list-tables --region ${REGION}`,
  '🗄️  Listando DynamoDB Tables'
);

if (dynamoResult.success) {
  const allTables = dynamoResult.data.TableNames || [];
  const trinityTables = allTables.filter((name) => {
    const lowerName = name.toLowerCase();
    return (
      lowerName.includes('trinity') ||
      lowerName.includes('room') ||
      lowerName.includes('vote') ||
      lowerName.includes('member')
    );
  });

  console.log(`   Encontradas: ${trinityTables.length} tablas relacionadas`);

  const tableDetails = [];
  for (const tableName of trinityTables) {
    try {
      const describeResult = execSync(
        `aws dynamodb describe-table --table-name ${tableName} --region ${REGION}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const table = JSON.parse(describeResult).Table;

      console.log(`\n   📋 ${tableName}`);
      console.log(`      Estado: ${table.TableStatus}`);
      console.log(`      Items: ${table.ItemCount || 0}`);

      if (table.StreamSpecification && table.StreamSpecification.StreamEnabled) {
        console.log(`      ✅ Stream: HABILITADO (${table.StreamSpecification.StreamViewType})`);
      } else {
        console.log(`      ⚠️  Stream: DESHABILITADO`);
      }

      tableDetails.push({
        name: tableName,
        status: table.TableStatus,
        itemCount: table.ItemCount,
        streamEnabled: table.StreamSpecification?.StreamEnabled || false,
      });
    } catch (error) {
      console.log(`   ❌ Error describiendo ${tableName}`);
    }
  }

  report.results.dynamoDBTables = { count: trinityTables.length, tables: tableDetails };
} else {
  report.results.dynamoDBTables = { count: 0, error: dynamoResult.error };
}

// Resumen
console.log('\n📊 RESUMEN DE VERIFICACIÓN');
console.log('='.repeat(60));
console.log(`✅ AppSync API: ${report.results.appSyncAPI?.exists ? 'EXISTE' : 'NO EXISTE'}`);
console.log(`📊 Data Sources: ${report.results.dataSources?.count || 0}`);
console.log(`🔗 Mutation Resolvers: ${report.results.mutationResolvers?.count || 0}`);
console.log(`🔗 Subscription Resolvers: ${report.results.subscriptionResolvers?.count || 0}`);
console.log(`⚡ Lambda Functions: ${report.results.lambdaFunctions?.count || 0}`);
console.log(`🗄️  DynamoDB Tables: ${report.results.dynamoDBTables?.count || 0}`);

// Análisis de problemas
console.log('\n⚠️  ANÁLISIS DE PROBLEMAS');
console.log('='.repeat(60));

const problems = [];

if (!report.results.appSyncAPI?.exists) {
  problems.push('❌ CRÍTICO: AppSync API no encontrada o no accesible');
}

if ((report.results.dataSources?.count || 0) === 0) {
  problems.push('❌ CRÍTICO: NO hay Data Sources configurados en AppSync');
}

if ((report.results.mutationResolvers?.count || 0) === 0) {
  problems.push('❌ CRÍTICO: NO hay Mutation Resolvers configurados');
}

if ((report.results.subscriptionResolvers?.count || 0) === 0) {
  problems.push('❌ CRÍTICO: NO hay Subscription Resolvers configurados');
}

if ((report.results.lambdaFunctions?.count || 0) === 0) {
  problems.push('⚠️  ADVERTENCIA: NO se encontraron Lambda Functions relacionadas');
}

if ((report.results.dynamoDBTables?.count || 0) === 0) {
  problems.push('❌ CRÍTICO: NO se encontraron tablas DynamoDB relacionadas');
} else {
  const tablesWithoutStreams = (report.results.dynamoDBTables?.tables || []).filter(
    (t) => !t.streamEnabled
  );
  if (tablesWithoutStreams.length > 0) {
    problems.push(
      `⚠️  ADVERTENCIA: ${tablesWithoutStreams.length} tabla(s) sin DynamoDB Streams habilitados`
    );
  }
}

if (problems.length === 0) {
  console.log('✅ No se detectaron problemas críticos');
  console.log('✅ La infraestructura parece estar correctamente configurada');
} else {
  problems.forEach((problem) => console.log(problem));
}

// Guardar reporte
const reportPath = path.join(__dirname, 'APPSYNC_INFRASTRUCTURE_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n💾 Reporte completo guardado en: ${reportPath}`);

console.log('\n✅ Verificación completada');
console.log('='.repeat(60));

// Conclusión
console.log('\n🎯 CONCLUSIÓN');
console.log('='.repeat(60));

if (problems.filter((p) => p.includes('CRÍTICO')).length > 0) {
  console.log('❌ Se encontraron problemas CRÍTICOS que impiden el funcionamiento');
  console.log('   del sistema de votación en tiempo real.');
  console.log('\n📝 PRÓXIMOS PASOS:');
  console.log('   1. Revisar el reporte detallado en APPSYNC_INFRASTRUCTURE_REPORT.json');
  console.log('   2. Consultar REALTIME_VOTING_ANALYSIS.md para el plan de acción');
  console.log('   3. Solicitar aprobación para implementar las correcciones necesarias');
} else if (problems.length > 0) {
  console.log('⚠️  Se encontraron advertencias que podrían afectar el rendimiento');
  console.log('   pero el sistema debería funcionar básicamente.');
  console.log('\n📝 RECOMENDACIÓN:');
  console.log('   Revisar las advertencias y considerar optimizaciones.');
} else {
  console.log('✅ La infraestructura está correctamente configurada');
  console.log('   El sistema de votación en tiempo real debería funcionar.');
  console.log('\n📝 SIGUIENTE PASO:');
  console.log('   Probar el flujo completo desde la aplicación móvil.');
}

console.log('\n');
