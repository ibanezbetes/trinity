#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TrinityStack } from '../lib/trinity-stack';

const app = new cdk.App();

// Stack principal con toda la funcionalidad
const mainStack = new TrinityStack(app, 'TrinityMvpStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Trinity MVP - Aplicación para consensuar contenido multimedia en grupo',
});
