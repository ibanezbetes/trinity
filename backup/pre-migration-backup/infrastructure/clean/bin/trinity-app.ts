#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TrinityMainStack } from '../lib/trinity-main-stack';
import { TrinityLambdaStack } from '../lib/trinity-lambda-stack';
import { TrinityDatabaseStack } from '../lib/trinity-database-stack';
import { TrinityApiStack } from '../lib/trinity-api-stack';
import { TrinityCognitoStack } from '../lib/trinity-cognito-stack';
import { TrinityConfigStack } from '../lib/trinity-config-stack';
import { getEnvironmentConfig, validateEnvironmentConfig } from '../config/environments';

const app = new cdk.App();

// Get environment configuration
const environment = app.node.tryGetContext('environment') || process.env.TRINITY_ENV || 'dev';
const config = getEnvironmentConfig(environment);

// Validate configuration
validateEnvironmentConfig(config);

// Environment configuration
const defaultEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

// Stack de configuración (Parameter Store)
const configStack = new TrinityConfigStack(app, 'TrinityConfigStack', {
  env: defaultEnv,
  description: 'Trinity - Configuration and Parameter Store',
  config,
});

// Stack de base de datos (DynamoDB)
const databaseStack = new TrinityDatabaseStack(app, 'TrinityDatabaseStack', {
  env: defaultEnv,
  description: 'Trinity - DynamoDB Tables and Database Resources',
  config,
});

// Stack de funciones Lambda
const lambdaStack = new TrinityLambdaStack(app, 'TrinityLambdaStack', {
  env: defaultEnv,
  description: 'Trinity - Lambda Functions',
  config,
  tables: databaseStack.tables,
  parameterStore: configStack.parameterStore,
});

// Stack de Cognito (User Pool y autenticación)
const cognitoStack = new TrinityCognitoStack(app, 'TrinityCognitoStack', {
  env: defaultEnv,
  description: 'Trinity - Cognito User Pool and Authentication',
  config,
});

// Stack de APIs (AppSync) - Depends on Cognito and Lambda
const apiStack = new TrinityApiStack(app, 'TrinityApiStack', {
  env: defaultEnv,
  description: 'Trinity - GraphQL APIs (AppSync)',
  config,
  userPool: cognitoStack.getUserPool(),
  tables: databaseStack.tables,
  lambdaFunctions: lambdaStack.functions,
});

// Stack principal (recursos compartidos) - Temporarily disabled to fix circular dependency
// const mainStack = new TrinityMainStack(app, 'TrinityMainStack', {
//   env: defaultEnv,
//   description: 'Trinity - Main Infrastructure and Shared Resources',
//   config,
//   databaseStack,
//   lambdaStack,
//   cognitoStack,
//   apiStack,
//   configStack,
// });

// Tags globales
cdk.Tags.of(app).add('Project', 'Trinity');
cdk.Tags.of(app).add('Environment', config.environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Region', config.region);