/**
 * Script para verificar AppSync usando solo AWS CLI
 * Sin dependencias de Node.js
 */

const { execSync } = require('child_process');
const fs = require('fs');

const REGION = 'eu-west-1';
const APPSYNC_API_ID = 'epjtt2y3fzh53ii6omzj6n6h5a';

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
 * Ejecutar comando AWS CLI
 */
function runCommand(command, description) {
  console.log(`\n${description}`);
  console.log('='.repeat(60));

  try {
    const result = execSync(command, { encoding: 'utf-8' });
    const parsed = JSON.parse(result);
    console.log('✅ Comando ejecutado exitosamente');
    return { success: true, data: parsed };
  } catch (error) {
    console.error('❌ Error:', error.message.split('\n')[0]);
    return { success: false, error: error.message };
  }
}

// 1. AppSync API
const api = runCommand(
  `aws appsync get-graphql-api --api-id ${APPSYNC_API_ID} --region ${REGION}`,
  '📡 Verificando AppSync API'
);

if (api.success) {
  const a = api.data.graphqlApi;
  console.log(`   Nombre: ${a.name}`);
  console.log(`   Endpoint: ${a.uris?.GRAPHQL || 'N/A'}`);
  console.log(`   Auth: ${a.authenticationType}`);
  report.results.appSyncAPI = { exists: true };
} else {
  report.results.appSyncAPI = { exists: false };
}

// 2. Data Sources
const ds = runCommand(
  `aws appsync list-data-sources --api-id ${APPSYNC_API_ID} --region ${REGION}`,
  '📊 Data Sources'
);

if (ds.success) {
  const sources = ds.data.dataSources || [];
  console.log(`   Total: ${sources.length}`);
  sources.forEach((s, i) => console.log(`   ${i + 1}. ${s.name} (${s.type})`));
  report.results.dataSources = { count: sources.length };
} else {
  report.results.dataSources = { count: 0 };
}

// 3. Mutation Resolvers
const mr = runCommand(
  `aws appsync list-resolvers --api-id ${APPSYNC_API_ID} --type-name Mutation --region ${REGION}`,
  '🔗 Mutation Resolvers'
);

if (mr.success) {
  const resolvers = mr.data.resolvers || [];
  console.log(`   Total: ${resolvers.length}`);
  resolvers.forEach((r) => console.log(`   - ${r.fieldName}`));
  report.results.mutationResolvers = { count: resolvers.length };
} else {
  report.results.mutationResolvers = { count: 0 };
}

// 4. Subscription Resolvers
const sr = runCommand(
  `aws appsync list-resolvers --api-id ${APPSYNC_API_ID} --type-name Subscription --region ${REGION}`,
  '🔗 Subscription Resolvers'
);

if (sr.success) {
  const resolvers = sr.data.resolvers || [];
  console.log(`   Total: ${resolvers.length}`);
  resolvers.forEach((r) => console.log(`   - ${r.fieldName}`));
  report.results.subscriptionResolvers = { count: resolvers.length };
} else {
  report.results.subscriptionResolvers = { count: 0 };
}

// 5. Lambda Functions
const lf = runCommand(`aws lambda list-functions --region ${REGION}`, '⚡ Lambda Functions');

if (lf.success) {
  const all = lf.data.Functions || [];
  const trinity = all.filter((f) => {
    const n = f.FunctionName.toLowerCase();
    return n.includes('trinity') || n.includes('vote') || n.includes('room');
  });
  console.log(`   Total relacionadas: ${trinity.length}`);
  trinity.forEach((f, i) => console.log(`   ${i + 1}. ${f.FunctionName}`));
  report.results.lambdaFunctions = { count: trinity.length };
} else {
  report.results.lambdaFunctions = { count: 0 };
}

// 6. DynamoDB Tables
const dt = runCommand(`aws dynamodb list-tables --region ${REGION}`, '🗄️  DynamoDB Tables');

if (dt.success) {
  const all = dt.data.TableNames || [];
  const trinity = all.filter((n) => {
    const l = n.toLowerCase();
    return l.includes('trinity') || l.includes('room') || l.includes('vote');
  });
  console.log(`   Total relacionadas: ${trinity.length}`);
  trinity.forEach((t, i) => console.log(`   ${i + 1}. ${t}`));
  report.results.dynamoDBTables = { count: trinity.length };
} else {
  report.results.dynamoDBTables = { count: 0 };
}

// Resumen
console.log('\n📊 RESUMEN');
console.log('='.repeat(60));
console.log(`AppSync API: ${report.results.appSyncAPI?.exists ? '✅' : '❌'}`);
console.log(`Data Sources: ${report.results.dataSources?.count || 0}`);
console.log(`Mutation Resolvers: ${report.results.mutationResolvers?.count || 0}`);
console.log(`Subscription Resolvers: ${report.results.subscriptionResolvers?.count || 0}`);
console.log(`Lambda Functions: ${report.results.lambdaFunctions?.count || 0}`);
console.log(`DynamoDB Tables: ${report.results.dynamoDBTables?.count || 0}`);

// Problemas
console.log('\n⚠️  PROBLEMAS DETECTADOS');
console.log('='.repeat(60));

const problems = [];
if (!report.results.appSyncAPI?.exists) problems.push('❌ AppSync API no accesible');
if ((report.results.dataSources?.count || 0) === 0) problems.push('❌ Sin Data Sources');
if ((report.results.mutationResolvers?.count || 0) === 0) problems.push('❌ Sin Mutation Resolvers');
if ((report.results.subscriptionResolvers?.count || 0) === 0)
  problems.push('❌ Sin Subscription Resolvers');
if ((report.results.lambdaFunctions?.count || 0) === 0) problems.push('⚠️  Sin Lambda Functions');
if ((report.results.dynamoDBTables?.count || 0) === 0) problems.push('❌ Sin DynamoDB Tables');

if (problems.length === 0) {
  console.log('✅ No se detectaron problemas');
} else {
  problems.forEach((p) => console.log(p));
}

// Guardar
fs.writeFileSync('APPSYNC_REPORT.json', JSON.stringify(report, null, 2));
console.log('\n💾 Reporte guardado en: APPSYNC_REPORT.json');

// Conclusión
console.log('\n🎯 CONCLUSIÓN');
console.log('='.repeat(60));

const critical = problems.filter((p) => p.includes('❌')).length;

if (critical > 0) {
  console.log('❌ Problemas CRÍTICOS detectados');
  console.log('   El sistema de votación NO funcionará hasta que se corrijan.');
  console.log('\n📝 Consulta REALTIME_VOTING_ANALYSIS.md para el plan de acción.');
} else if (problems.length > 0) {
  console.log('⚠️  Advertencias detectadas, pero el sistema podría funcionar.');
} else {
  console.log('✅ Infraestructura correctamente configurada.');
}

console.log('\n');
