#!/usr/bin/env node
/**
 * Simple test for API stack validation
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { getEnvironmentConfig } from './config/environments';

const app = new cdk.App();
const config = getEnvironmentConfig('dev');

const stack = new cdk.Stack(app, 'TestStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
});

// Test basic AppSync API creation
const api = new appsync.GraphqlApi(stack, 'TestApi', {
  name: 'test-api',
  schema: appsync.SchemaFile.fromAsset('../../api/schemas/trinity-realtime-schema.graphql'),
  authorizationConfig: {
    defaultAuthorization: {
      authorizationType: appsync.AuthorizationType.API_KEY,
    },
  },
});

// Test Cognito User Pool creation
const userPool = new cognito.UserPool(stack, 'TestUserPool', {
  userPoolName: 'test-user-pool',
  signInAliases: {
    email: true,
  },
  autoVerify: {
    email: true,
  },
});

console.log('✅ Simple API and Cognito constructs created successfully!');
console.log('📊 API ID:', api.apiId);
console.log('📊 User Pool ID:', userPool.userPoolId);