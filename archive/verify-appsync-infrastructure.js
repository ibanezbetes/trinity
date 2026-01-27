/**
 * Script para verificar el estado de la infraestructura AppSync
 * NO hace cambios, solo lee y reporta
 */

const {
  AppSyncClient,
  GetGraphqlApiCommand,
  ListDataSourcesCommand,
  ListResolversCommand,
  GetSchemaCreationStatusCommand,
} = require('@aws-sdk/client-appsync');

const {
  LambdaClient,
  ListFunctionsCommand,
} = require('@aws-sdk/client-lambda');

const {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
} = require('@aws-sdk/client-dynamodb');

const fs = require('fs');
const path = require('path');

// Configuración desde .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const REGION = process.env.AWS_REGION || 'eu-west-1';
const APPSYNC_API_ID = process.env.APPSYNC_API_ID || 'epjtt2y3fzh53ii6omzj6n6h5a';

// Clientes AWS
const appSyncClient = new AppSyncClient({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION });

/**
 * Verificar API de AppSync
 */
async function verifyAppSyncAPI() {
  console.log('\n📡 Verificando AppSync API...');
  console.log('='.repeat(60));

  try {
    const command = new GetGraphqlApiCommand({ apiId: APPSYNC_API_ID });
    const response = await appSyncClient.send(command);
    const api = response.graphqlApi;

    console.log('✅ AppSync API encontrada:');
    console.log(`   ID: ${api.apiId}`);
    console.log(`   Nombre: ${api.name}`);
    console.log(`   Endpoint: ${api.uris?.GRAPHQL || 'N/A'}`);
    console.log(`   Realtime Endpoint: ${api.uris?.REALTIME || 'N/A'}`);
    console.log(`   Tipo de Auth: ${api.authenticationType}`);
    console.log(`   Estado: ${api.apiId ? 'ACTIVA' : 'INACTIVA'}`);

    return {
      exists: true,
      api: api,
    };
  } catch (error) {
    console.error('❌ Error verificando AppSync API:', error.message);
    return {
      exists: false,
      error: error.message,
    };
  }
}

/**
 * Listar Data Sources de AppSync
 */
async function listDataSources() {
  console.log('\n📊 Verificando Data Sources...');
  console.log('='.repeat(60));

  try {
    const command = new ListDataSourcesCommand({ apiId: APPSYNC_API_ID });
    const response = await appSyncClient.send(command);
    const dataSources = response.dataSources || [];

    if (dataSources.length === 0) {
      console.log('⚠️  NO se encontraron Data Sources configurados');
      return { count: 0, dataSources: [] };
    }

    console.log(`✅ Encontrados ${dataSources.length} Data Sources:`);
    dataSources.forEach((ds, index) => {
      console.log(`\n   ${index + 1}. ${ds.name}`);
      console.log(`      Tipo: ${ds.type}`);
      if (ds.type === 'AWS_LAMBDA') {
        console.log(`      Lambda ARN: ${ds.lambdaConfig?.lambdaFunctionArn || 'N/A'}`);
      } else if (ds.type === 'AMAZON_DYNAMODB') {
        console.log(`      DynamoDB Table: ${ds.dynamodbConfig?.tableName || 'N/A'}`);
        console.log(`      Region: ${ds.dynamodbConfig?.awsRegion || 'N/A'}`);
      }
    });

    return {
      count: dataSources.length,
      dataSources: dataSources,
    };
  } catch (error) {
    console.error('❌ Error listando Data Sources:', error.message);
    return {
      count: 0,
      error: error.message,
    };
  }
}

/**
 * Listar Resolvers de AppSync
 */
async function listResolvers() {
  console.log('\n🔗 Verificando Resolvers...');
  console.log('='.repeat(60));

  const types = ['Query', 'Mutation', 'Subscription'];
  const allResolvers = [];

  for (const typeName of types) {
    try {
      const command = new ListResolversCommand({
        apiId: APPSYNC_API_ID,
        typeName: typeName,
      });
      const response = await appSyncClient.send(command);
      const resolvers = response.resolvers || [];

      if (resolvers.length > 0) {
        console.log(`\n   ${typeName}:`);
        resolvers.forEach((resolver) => {
          console.log(`      - ${resolver.fieldName} → ${resolver.dataSourceName || 'N/A'}`);
          allResolvers.push({
            type: typeName,
            field: resolver.fieldName,
            dataSource: resolver.dataSourceName,
          });
        });
      } else {
        console.log(`\n   ${typeName}: ⚠️  Sin resolvers configurados`);
      }
    } catch (error) {
      console.log(`\n   ${typeName}: ❌ Error: ${error.message}`);
    }
  }

  if (allResolvers.length === 0) {
    console.log('\n⚠️  NO se encontraron Resolvers configurados');
  } else {
    console.log(`\n✅ Total de Resolvers: ${allResolvers.length}`);
  }

  return {
    count: allResolvers.length,
    resolvers: allResolvers,
  };
}

/**
 * Listar Lambdas relacionadas con Trinity
 */
async function listLambdaFunctions() {
  console.log('\n⚡ Verificando Lambda Functions...');
  console.log('='.repeat(60));

  try {
    const command = new ListFunctionsCommand({});
    const response = await lambdaClient.send(command);
    const allFunctions = response.Functions || [];

    // Filtrar funciones relacionadas con Trinity
    const trinityFunctions = allFunctions.filter((fn) => {
      const name = fn.FunctionName.toLowerCase();
      return (
        name.includes('trinity') ||
        name.includes('vote') ||
        name.includes('room') ||
        name.includes('realtime') ||
        name.includes('connection')
      );
    });

    if (trinityFunctions.length === 0) {
      console.log('⚠️  NO se encontraron Lambda Functions relacionadas con Trinity');
      return { count: 0, functions: [] };
    }

    console.log(`✅ Encontradas ${trinityFunctions.length} Lambda Functions:`);
    trinityFunctions.forEach((fn, index) => {
      console.log(`\n   ${index + 1}. ${fn.FunctionName}`);
      console.log(`      Runtime: ${fn.Runtime}`);
      console.log(`      Handler: ${fn.Handler}`);
      console.log(`      Última modificación: ${fn.LastModified}`);
      console.log(`      Memoria: ${fn.MemorySize} MB`);
      console.log(`      Timeout: ${fn.Timeout} segundos`);
    });

    return {
      count: trinityFunctions.length,
      functions: trinityFunctions,
    };
  } catch (error) {
    console.error('❌ Error listando Lambda Functions:', error.message);
    return {
      count: 0,
      error: error.message,
    };
  }
}

/**
 * Listar y verificar tablas DynamoDB
 */
async function listDynamoDBTables() {
  console.log('\n🗄️  Verificando DynamoDB Tables...');
  console.log('='.repeat(60));

  try {
    const listCommand = new ListTablesCommand({});
    const listResponse = await dynamoClient.send(listCommand);
    const allTables = listResponse.TableNames || [];

    // Filtrar tablas relacionadas con Trinity
    const trinityTables = allTables.filter((name) => {
      const lowerName = name.toLowerCase();
      return (
        lowerName.includes('trinity') ||
        lowerName.includes('room') ||
        lowerName.includes('vote') ||
        lowerName.includes('member')
      );
    });

    if (trinityTables.length === 0) {
      console.log('⚠️  NO se encontraron tablas DynamoDB relacionadas con Trinity');
      return { count: 0, tables: [] };
    }

    console.log(`✅ Encontradas ${trinityTables.length} tablas DynamoDB:`);

    const tableDetails = [];

    for (const tableName of trinityTables) {
      try {
        const describeCommand = new DescribeTableCommand({ TableName: tableName });
        const describeResponse = await dynamoClient.send(describeCommand);
        const table = describeResponse.Table;

        console.log(`\n   📋 ${tableName}`);
        console.log(`      Estado: ${table.TableStatus}`);
        console.log(`      Items (aprox): ${table.ItemCount || 0}`);
        console.log(`      Tamaño: ${(table.TableSizeBytes / 1024).toFixed(2)} KB`);

        // Verificar si tiene Stream habilitado
        if (table.StreamSpecification && table.StreamSpecification.StreamEnabled) {
          console.log(`      ✅ DynamoDB Stream: HABILITADO`);
          console.log(`         Stream ARN: ${table.LatestStreamArn || 'N/A'}`);
          console.log(`         View Type: ${table.StreamSpecification.StreamViewType}`);
        } else {
          console.log(`      ⚠️  DynamoDB Stream: DESHABILITADO`);
        }

        // Mostrar claves
        console.log(`      Claves:`);
        table.KeySchema.forEach((key) => {
          const attr = table.AttributeDefinitions.find((a) => a.AttributeName === key.AttributeName);
          console.log(`         - ${key.AttributeName} (${key.KeyType}): ${attr?.AttributeType || 'N/A'}`);
        });

        tableDetails.push({
          name: tableName,
          status: table.TableStatus,
          itemCount: table.ItemCount,
          streamEnabled: table.StreamSpecification?.StreamEnabled || false,
          streamArn: table.LatestStreamArn,
        });
      } catch (error) {
        console.log(`\n   ❌ Error describiendo tabla ${tableName}: ${error.message}`);
      }
    }

    return {
      count: trinityTables.length,
      tables: tableDetails,
    };
  } catch (error) {
    console.error('❌ Error listando tablas DynamoDB:', error.message);
    return {
      count: 0,
      error: error.message,
    };
  }
}

/**
 * Generar reporte completo
 */
async function generateReport() {
  console.log('\n🔍 VERIFICACIÓN DE INFRAESTRUCTURA APPSYNC - TRINITY TFG');
  console.log('='.repeat(60));
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log(`Región: ${REGION}`);
  console.log(`AppSync API ID: ${APPSYNC_API_ID}`);

  const report = {
    timestamp: new Date().toISOString(),
    region: REGION,
    appSyncApiId: APPSYNC_API_ID,
  };

  // Verificar cada componente
  report.appSyncAPI = await verifyAppSyncAPI();
  report.dataSources = await listDataSources();
  report.resolvers = await listResolvers();
  report.lambdaFunctions = await listLambdaFunctions();
  report.dynamoDBTables = await listDynamoDBTables();

  // Resumen
  console.log('\n📊 RESUMEN DE VERIFICACIÓN');
  console.log('='.repeat(60));
  console.log(`✅ AppSync API: ${report.appSyncAPI.exists ? 'EXISTE' : 'NO EXISTE'}`);
  console.log(`📊 Data Sources: ${report.dataSources.count}`);
  console.log(`🔗 Resolvers: ${report.resolvers.count}`);
  console.log(`⚡ Lambda Functions: ${report.lambdaFunctions.count}`);
  console.log(`🗄️  DynamoDB Tables: ${report.dynamoDBTables.count}`);

  // Análisis de problemas
  console.log('\n⚠️  PROBLEMAS DETECTADOS');
  console.log('='.repeat(60));

  const problems = [];

  if (!report.appSyncAPI.exists) {
    problems.push('❌ AppSync API no encontrada o no accesible');
  }

  if (report.dataSources.count === 0) {
    problems.push('❌ NO hay Data Sources configurados en AppSync');
  }

  if (report.resolvers.count === 0) {
    problems.push('❌ NO hay Resolvers configurados en AppSync');
  }

  if (report.lambdaFunctions.count === 0) {
    problems.push('⚠️  NO se encontraron Lambda Functions relacionadas');
  }

  if (report.dynamoDBTables.count === 0) {
    problems.push('❌ NO se encontraron tablas DynamoDB relacionadas');
  } else {
    // Verificar si las tablas tienen Streams habilitados
    const tablesWithoutStreams = report.dynamoDBTables.tables.filter((t) => !t.streamEnabled);
    if (tablesWithoutStreams.length > 0) {
      problems.push(
        `⚠️  ${tablesWithoutStreams.length} tabla(s) sin DynamoDB Streams: ${tablesWithoutStreams.map((t) => t.name).join(', ')}`
      );
    }
  }

  if (problems.length === 0) {
    console.log('✅ No se detectaron problemas críticos');
  } else {
    problems.forEach((problem) => console.log(problem));
  }

  // Guardar reporte en archivo
  const reportPath = path.join(__dirname, 'APPSYNC_INFRASTRUCTURE_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Reporte guardado en: ${reportPath}`);

  console.log('\n✅ Verificación completada');
  console.log('='.repeat(60));
}

// Ejecutar verificación
generateReport().catch((error) => {
  console.error('\n❌ Error fatal durante la verificación:', error);
  process.exit(1);
});
