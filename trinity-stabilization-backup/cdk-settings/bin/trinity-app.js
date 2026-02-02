#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const trinity_lambda_stack_1 = require("../lib/trinity-lambda-stack");
const trinity_database_stack_1 = require("../lib/trinity-database-stack");
const trinity_api_stack_1 = require("../lib/trinity-api-stack");
const trinity_cognito_stack_1 = require("../lib/trinity-cognito-stack");
const trinity_config_stack_1 = require("../lib/trinity-config-stack");
const environments_1 = require("../config/environments");
const app = new cdk.App();
// Get environment configuration
const environment = app.node.tryGetContext('environment') || process.env.TRINITY_ENV || 'dev';
const config = (0, environments_1.getEnvironmentConfig)(environment);
// Validate configuration
(0, environments_1.validateEnvironmentConfig)(config);
// Environment configuration
const defaultEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
};
// Stack de configuración (Parameter Store)
const configStack = new trinity_config_stack_1.TrinityConfigStack(app, 'TrinityConfigStack', {
    env: defaultEnv,
    description: 'Trinity - Configuration and Parameter Store',
    config,
});
// Stack de base de datos (DynamoDB)
const databaseStack = new trinity_database_stack_1.TrinityDatabaseStack(app, 'TrinityDatabaseStack', {
    env: defaultEnv,
    description: 'Trinity - DynamoDB Tables and Database Resources',
    config,
});
// Stack de funciones Lambda
const lambdaStack = new trinity_lambda_stack_1.TrinityLambdaStack(app, 'TrinityLambdaStack', {
    env: defaultEnv,
    description: 'Trinity - Lambda Functions',
    config,
    tables: databaseStack.tables,
    parameterStore: configStack.parameterStore,
});
// Stack de Cognito (User Pool y autenticación)
const cognitoStack = new trinity_cognito_stack_1.TrinityCognitoStack(app, 'TrinityCognitoStack', {
    env: defaultEnv,
    description: 'Trinity - Cognito User Pool and Authentication',
    config,
});
// Stack de APIs (AppSync) - Depends on Cognito and Lambda
const apiStack = new trinity_api_stack_1.TrinityApiStack(app, 'TrinityApiStack', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1hcHAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0cmluaXR5LWFwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBRW5DLHNFQUFpRTtBQUNqRSwwRUFBcUU7QUFDckUsZ0VBQTJEO0FBQzNELHdFQUFtRTtBQUNuRSxzRUFBaUU7QUFDakUseURBQXlGO0FBRXpGLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLGdDQUFnQztBQUNoQyxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxLQUFLLENBQUM7QUFDOUYsTUFBTSxNQUFNLEdBQUcsSUFBQSxtQ0FBb0IsRUFBQyxXQUFXLENBQUMsQ0FBQztBQUVqRCx5QkFBeUI7QUFDekIsSUFBQSx3Q0FBeUIsRUFBQyxNQUFNLENBQUMsQ0FBQztBQUVsQyw0QkFBNEI7QUFDNUIsTUFBTSxVQUFVLEdBQUc7SUFDakIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO0lBQ3hDLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtDQUN0QixDQUFDO0FBRUYsMkNBQTJDO0FBQzNDLE1BQU0sV0FBVyxHQUFHLElBQUkseUNBQWtCLENBQUMsR0FBRyxFQUFFLG9CQUFvQixFQUFFO0lBQ3BFLEdBQUcsRUFBRSxVQUFVO0lBQ2YsV0FBVyxFQUFFLDZDQUE2QztJQUMxRCxNQUFNO0NBQ1AsQ0FBQyxDQUFDO0FBRUgsb0NBQW9DO0FBQ3BDLE1BQU0sYUFBYSxHQUFHLElBQUksNkNBQW9CLENBQUMsR0FBRyxFQUFFLHNCQUFzQixFQUFFO0lBQzFFLEdBQUcsRUFBRSxVQUFVO0lBQ2YsV0FBVyxFQUFFLGtEQUFrRDtJQUMvRCxNQUFNO0NBQ1AsQ0FBQyxDQUFDO0FBRUgsNEJBQTRCO0FBQzVCLE1BQU0sV0FBVyxHQUFHLElBQUkseUNBQWtCLENBQUMsR0FBRyxFQUFFLG9CQUFvQixFQUFFO0lBQ3BFLEdBQUcsRUFBRSxVQUFVO0lBQ2YsV0FBVyxFQUFFLDRCQUE0QjtJQUN6QyxNQUFNO0lBQ04sTUFBTSxFQUFFLGFBQWEsQ0FBQyxNQUFNO0lBQzVCLGNBQWMsRUFBRSxXQUFXLENBQUMsY0FBYztDQUMzQyxDQUFDLENBQUM7QUFFSCwrQ0FBK0M7QUFDL0MsTUFBTSxZQUFZLEdBQUcsSUFBSSwyQ0FBbUIsQ0FBQyxHQUFHLEVBQUUscUJBQXFCLEVBQUU7SUFDdkUsR0FBRyxFQUFFLFVBQVU7SUFDZixXQUFXLEVBQUUsZ0RBQWdEO0lBQzdELE1BQU07Q0FDUCxDQUFDLENBQUM7QUFFSCwwREFBMEQ7QUFDMUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxtQ0FBZSxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsRUFBRTtJQUMzRCxHQUFHLEVBQUUsVUFBVTtJQUNmLFdBQVcsRUFBRSxrQ0FBa0M7SUFDL0MsTUFBTTtJQUNOLFFBQVEsRUFBRSxZQUFZLENBQUMsV0FBVyxFQUFFO0lBQ3BDLE1BQU0sRUFBRSxhQUFhLENBQUMsTUFBTTtJQUM1QixlQUFlLEVBQUUsV0FBVyxDQUFDLFNBQVM7Q0FDdkMsQ0FBQyxDQUFDO0FBRUgsMkZBQTJGO0FBQzNGLG9FQUFvRTtBQUNwRSxxQkFBcUI7QUFDckIsdUVBQXVFO0FBQ3ZFLFlBQVk7QUFDWixtQkFBbUI7QUFDbkIsaUJBQWlCO0FBQ2pCLGtCQUFrQjtBQUNsQixjQUFjO0FBQ2QsaUJBQWlCO0FBQ2pCLE1BQU07QUFFTixnQkFBZ0I7QUFDaEIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUMzQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUN4RCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ3pDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxyXG5pbXBvcnQgJ3NvdXJjZS1tYXAtc3VwcG9ydC9yZWdpc3Rlcic7XHJcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IFRyaW5pdHlNYWluU3RhY2sgfSBmcm9tICcuLi9saWIvdHJpbml0eS1tYWluLXN0YWNrJztcclxuaW1wb3J0IHsgVHJpbml0eUxhbWJkYVN0YWNrIH0gZnJvbSAnLi4vbGliL3RyaW5pdHktbGFtYmRhLXN0YWNrJztcclxuaW1wb3J0IHsgVHJpbml0eURhdGFiYXNlU3RhY2sgfSBmcm9tICcuLi9saWIvdHJpbml0eS1kYXRhYmFzZS1zdGFjayc7XHJcbmltcG9ydCB7IFRyaW5pdHlBcGlTdGFjayB9IGZyb20gJy4uL2xpYi90cmluaXR5LWFwaS1zdGFjayc7XHJcbmltcG9ydCB7IFRyaW5pdHlDb2duaXRvU3RhY2sgfSBmcm9tICcuLi9saWIvdHJpbml0eS1jb2duaXRvLXN0YWNrJztcclxuaW1wb3J0IHsgVHJpbml0eUNvbmZpZ1N0YWNrIH0gZnJvbSAnLi4vbGliL3RyaW5pdHktY29uZmlnLXN0YWNrJztcclxuaW1wb3J0IHsgZ2V0RW52aXJvbm1lbnRDb25maWcsIHZhbGlkYXRlRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9jb25maWcvZW52aXJvbm1lbnRzJztcclxuXHJcbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XHJcblxyXG4vLyBHZXQgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxyXG5jb25zdCBlbnZpcm9ubWVudCA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vudmlyb25tZW50JykgfHwgcHJvY2Vzcy5lbnYuVFJJTklUWV9FTlYgfHwgJ2Rldic7XHJcbmNvbnN0IGNvbmZpZyA9IGdldEVudmlyb25tZW50Q29uZmlnKGVudmlyb25tZW50KTtcclxuXHJcbi8vIFZhbGlkYXRlIGNvbmZpZ3VyYXRpb25cclxudmFsaWRhdGVFbnZpcm9ubWVudENvbmZpZyhjb25maWcpO1xyXG5cclxuLy8gRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxyXG5jb25zdCBkZWZhdWx0RW52ID0ge1xyXG4gIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXHJcbiAgcmVnaW9uOiBjb25maWcucmVnaW9uLFxyXG59O1xyXG5cclxuLy8gU3RhY2sgZGUgY29uZmlndXJhY2nDs24gKFBhcmFtZXRlciBTdG9yZSlcclxuY29uc3QgY29uZmlnU3RhY2sgPSBuZXcgVHJpbml0eUNvbmZpZ1N0YWNrKGFwcCwgJ1RyaW5pdHlDb25maWdTdGFjaycsIHtcclxuICBlbnY6IGRlZmF1bHRFbnYsXHJcbiAgZGVzY3JpcHRpb246ICdUcmluaXR5IC0gQ29uZmlndXJhdGlvbiBhbmQgUGFyYW1ldGVyIFN0b3JlJyxcclxuICBjb25maWcsXHJcbn0pO1xyXG5cclxuLy8gU3RhY2sgZGUgYmFzZSBkZSBkYXRvcyAoRHluYW1vREIpXHJcbmNvbnN0IGRhdGFiYXNlU3RhY2sgPSBuZXcgVHJpbml0eURhdGFiYXNlU3RhY2soYXBwLCAnVHJpbml0eURhdGFiYXNlU3RhY2snLCB7XHJcbiAgZW52OiBkZWZhdWx0RW52LFxyXG4gIGRlc2NyaXB0aW9uOiAnVHJpbml0eSAtIER5bmFtb0RCIFRhYmxlcyBhbmQgRGF0YWJhc2UgUmVzb3VyY2VzJyxcclxuICBjb25maWcsXHJcbn0pO1xyXG5cclxuLy8gU3RhY2sgZGUgZnVuY2lvbmVzIExhbWJkYVxyXG5jb25zdCBsYW1iZGFTdGFjayA9IG5ldyBUcmluaXR5TGFtYmRhU3RhY2soYXBwLCAnVHJpbml0eUxhbWJkYVN0YWNrJywge1xyXG4gIGVudjogZGVmYXVsdEVudixcclxuICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgLSBMYW1iZGEgRnVuY3Rpb25zJyxcclxuICBjb25maWcsXHJcbiAgdGFibGVzOiBkYXRhYmFzZVN0YWNrLnRhYmxlcyxcclxuICBwYXJhbWV0ZXJTdG9yZTogY29uZmlnU3RhY2sucGFyYW1ldGVyU3RvcmUsXHJcbn0pO1xyXG5cclxuLy8gU3RhY2sgZGUgQ29nbml0byAoVXNlciBQb29sIHkgYXV0ZW50aWNhY2nDs24pXHJcbmNvbnN0IGNvZ25pdG9TdGFjayA9IG5ldyBUcmluaXR5Q29nbml0b1N0YWNrKGFwcCwgJ1RyaW5pdHlDb2duaXRvU3RhY2snLCB7XHJcbiAgZW52OiBkZWZhdWx0RW52LFxyXG4gIGRlc2NyaXB0aW9uOiAnVHJpbml0eSAtIENvZ25pdG8gVXNlciBQb29sIGFuZCBBdXRoZW50aWNhdGlvbicsXHJcbiAgY29uZmlnLFxyXG59KTtcclxuXHJcbi8vIFN0YWNrIGRlIEFQSXMgKEFwcFN5bmMpIC0gRGVwZW5kcyBvbiBDb2duaXRvIGFuZCBMYW1iZGFcclxuY29uc3QgYXBpU3RhY2sgPSBuZXcgVHJpbml0eUFwaVN0YWNrKGFwcCwgJ1RyaW5pdHlBcGlTdGFjaycsIHtcclxuICBlbnY6IGRlZmF1bHRFbnYsXHJcbiAgZGVzY3JpcHRpb246ICdUcmluaXR5IC0gR3JhcGhRTCBBUElzIChBcHBTeW5jKScsXHJcbiAgY29uZmlnLFxyXG4gIHVzZXJQb29sOiBjb2duaXRvU3RhY2suZ2V0VXNlclBvb2woKSxcclxuICB0YWJsZXM6IGRhdGFiYXNlU3RhY2sudGFibGVzLFxyXG4gIGxhbWJkYUZ1bmN0aW9uczogbGFtYmRhU3RhY2suZnVuY3Rpb25zLFxyXG59KTtcclxuXHJcbi8vIFN0YWNrIHByaW5jaXBhbCAocmVjdXJzb3MgY29tcGFydGlkb3MpIC0gVGVtcG9yYXJpbHkgZGlzYWJsZWQgdG8gZml4IGNpcmN1bGFyIGRlcGVuZGVuY3lcclxuLy8gY29uc3QgbWFpblN0YWNrID0gbmV3IFRyaW5pdHlNYWluU3RhY2soYXBwLCAnVHJpbml0eU1haW5TdGFjaycsIHtcclxuLy8gICBlbnY6IGRlZmF1bHRFbnYsXHJcbi8vICAgZGVzY3JpcHRpb246ICdUcmluaXR5IC0gTWFpbiBJbmZyYXN0cnVjdHVyZSBhbmQgU2hhcmVkIFJlc291cmNlcycsXHJcbi8vICAgY29uZmlnLFxyXG4vLyAgIGRhdGFiYXNlU3RhY2ssXHJcbi8vICAgbGFtYmRhU3RhY2ssXHJcbi8vICAgY29nbml0b1N0YWNrLFxyXG4vLyAgIGFwaVN0YWNrLFxyXG4vLyAgIGNvbmZpZ1N0YWNrLFxyXG4vLyB9KTtcclxuXHJcbi8vIFRhZ3MgZ2xvYmFsZXNcclxuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoJ1Byb2plY3QnLCAnVHJpbml0eScpO1xyXG5jZGsuVGFncy5vZihhcHApLmFkZCgnRW52aXJvbm1lbnQnLCBjb25maWcuZW52aXJvbm1lbnQpO1xyXG5jZGsuVGFncy5vZihhcHApLmFkZCgnTWFuYWdlZEJ5JywgJ0NESycpO1xyXG5jZGsuVGFncy5vZihhcHApLmFkZCgnUmVnaW9uJywgY29uZmlnLnJlZ2lvbik7Il19