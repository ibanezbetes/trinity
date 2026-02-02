#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TrinityMainStack } from '../clean/lib/trinity-main-stack';
import { TrinityLambdaStack } from '../clean/lib/trinity-lambda-stack';
import { TrinityDatabaseStack } from '../clean/lib/trinity-database-stack';
import { TrinityApiStack } from '../clean/lib/trinity-api-stack';
import { TrinityMatchmakingStack } from '../clean/lib/trinity-matchmaking-stack';

const app = new cdk.App();

// Configuración por defecto
const defaultEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'eu-west-1', // Región fija para Trinity
};

// Stack de base de datos (DynamoDB)
const databaseStack = new TrinityDatabaseStack(app, 'TrinityDatabaseStack', {
  env: defaultEnv,
  description: 'Trinity - DynamoDB Tables and Database Resources',
});

// Stack de funciones Lambda
const lambdaStack = new TrinityLambdaStack(app, 'TrinityLambdaStack', {
  env: defaultEnv,
  description: 'Trinity - Lambda Functions',
  // Pasar referencias de tablas
  tables: databaseStack.tables,
});

// Stack de APIs (AppSync)
const apiStack = new TrinityApiStack(app, 'TrinityApiStack', {
  env: defaultEnv,
  description: 'Trinity - GraphQL APIs and Cognito',
  // Pasar referencias de lambdas
  lambdaFunctions: lambdaStack.functions,
});

// Stack de Matchmaking (Vote Consensus - Independent)
const matchmakingStack = new TrinityMatchmakingStack(app, 'TrinityMatchmakingStack', {
  env: defaultEnv,
  description: 'Trinity - Vote Consensus Matchmaking (Independent)',
});

// Stack principal (recursos compartidos)
const mainStack = new TrinityMainStack(app, 'TrinityMainStack', {
  env: defaultEnv,
  description: 'Trinity - Main Infrastructure and Shared Resources',
  // Pasar referencias de otros stacks
  databaseStack,
  lambdaStack,
  apiStack,
});

// Tags globales
cdk.Tags.of(app).add('Project', 'Trinity');
cdk.Tags.of(app).add('Environment', 'dev');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
