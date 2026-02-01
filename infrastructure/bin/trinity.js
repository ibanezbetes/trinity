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
const trinity_main_stack_1 = require("../clean/lib/trinity-main-stack");
const trinity_lambda_stack_1 = require("../clean/lib/trinity-lambda-stack");
const trinity_database_stack_1 = require("../clean/lib/trinity-database-stack");
const trinity_api_stack_1 = require("../clean/lib/trinity-api-stack");
const trinity_matchmaking_stack_1 = require("../clean/lib/trinity-matchmaking-stack");
const app = new cdk.App();
// Configuración por defecto
const defaultEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1', // Región fija para Trinity
};
// Stack de base de datos (DynamoDB)
const databaseStack = new trinity_database_stack_1.TrinityDatabaseStack(app, 'TrinityDatabaseStack', {
    env: defaultEnv,
    description: 'Trinity - DynamoDB Tables and Database Resources',
});
// Stack de funciones Lambda
const lambdaStack = new trinity_lambda_stack_1.TrinityLambdaStack(app, 'TrinityLambdaStack', {
    env: defaultEnv,
    description: 'Trinity - Lambda Functions',
    // Pasar referencias de tablas
    tables: databaseStack.tables,
});
// Stack de APIs (AppSync)
const apiStack = new trinity_api_stack_1.TrinityApiStack(app, 'TrinityApiStack', {
    env: defaultEnv,
    description: 'Trinity - GraphQL APIs and Cognito',
    // Pasar referencias de lambdas
    lambdaFunctions: lambdaStack.functions,
});
// Stack de Matchmaking (Vote Consensus - Independent)
const matchmakingStack = new trinity_matchmaking_stack_1.TrinityMatchmakingStack(app, 'TrinityMatchmakingStack', {
    env: defaultEnv,
    description: 'Trinity - Vote Consensus Matchmaking (Independent)',
});
// Stack principal (recursos compartidos)
const mainStack = new trinity_main_stack_1.TrinityMainStack(app, 'TrinityMainStack', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyaW5pdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUNuQyx3RUFBbUU7QUFDbkUsNEVBQXVFO0FBQ3ZFLGdGQUEyRTtBQUMzRSxzRUFBaUU7QUFDakUsc0ZBQWlGO0FBRWpGLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLDRCQUE0QjtBQUM1QixNQUFNLFVBQVUsR0FBRztJQUNqQixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7SUFDeEMsTUFBTSxFQUFFLFdBQVcsRUFBRSwyQkFBMkI7Q0FDakQsQ0FBQztBQUVGLG9DQUFvQztBQUNwQyxNQUFNLGFBQWEsR0FBRyxJQUFJLDZDQUFvQixDQUFDLEdBQUcsRUFBRSxzQkFBc0IsRUFBRTtJQUMxRSxHQUFHLEVBQUUsVUFBVTtJQUNmLFdBQVcsRUFBRSxrREFBa0Q7Q0FDaEUsQ0FBQyxDQUFDO0FBRUgsNEJBQTRCO0FBQzVCLE1BQU0sV0FBVyxHQUFHLElBQUkseUNBQWtCLENBQUMsR0FBRyxFQUFFLG9CQUFvQixFQUFFO0lBQ3BFLEdBQUcsRUFBRSxVQUFVO0lBQ2YsV0FBVyxFQUFFLDRCQUE0QjtJQUN6Qyw4QkFBOEI7SUFDOUIsTUFBTSxFQUFFLGFBQWEsQ0FBQyxNQUFNO0NBQzdCLENBQUMsQ0FBQztBQUVILDBCQUEwQjtBQUMxQixNQUFNLFFBQVEsR0FBRyxJQUFJLG1DQUFlLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFO0lBQzNELEdBQUcsRUFBRSxVQUFVO0lBQ2YsV0FBVyxFQUFFLG9DQUFvQztJQUNqRCwrQkFBK0I7SUFDL0IsZUFBZSxFQUFFLFdBQVcsQ0FBQyxTQUFTO0NBQ3ZDLENBQUMsQ0FBQztBQUVILHNEQUFzRDtBQUN0RCxNQUFNLGdCQUFnQixHQUFHLElBQUksbURBQXVCLENBQUMsR0FBRyxFQUFFLHlCQUF5QixFQUFFO0lBQ25GLEdBQUcsRUFBRSxVQUFVO0lBQ2YsV0FBVyxFQUFFLG9EQUFvRDtDQUNsRSxDQUFDLENBQUM7QUFFSCx5Q0FBeUM7QUFDekMsTUFBTSxTQUFTLEdBQUcsSUFBSSxxQ0FBZ0IsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEVBQUU7SUFDOUQsR0FBRyxFQUFFLFVBQVU7SUFDZixXQUFXLEVBQUUsb0RBQW9EO0lBQ2pFLG9DQUFvQztJQUNwQyxhQUFhO0lBQ2IsV0FBVztJQUNYLFFBQVE7Q0FDVCxDQUFDLENBQUM7QUFFSCxnQkFBZ0I7QUFDaEIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUMzQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQzNDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcclxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgVHJpbml0eU1haW5TdGFjayB9IGZyb20gJy4uL2NsZWFuL2xpYi90cmluaXR5LW1haW4tc3RhY2snO1xyXG5pbXBvcnQgeyBUcmluaXR5TGFtYmRhU3RhY2sgfSBmcm9tICcuLi9jbGVhbi9saWIvdHJpbml0eS1sYW1iZGEtc3RhY2snO1xyXG5pbXBvcnQgeyBUcmluaXR5RGF0YWJhc2VTdGFjayB9IGZyb20gJy4uL2NsZWFuL2xpYi90cmluaXR5LWRhdGFiYXNlLXN0YWNrJztcclxuaW1wb3J0IHsgVHJpbml0eUFwaVN0YWNrIH0gZnJvbSAnLi4vY2xlYW4vbGliL3RyaW5pdHktYXBpLXN0YWNrJztcclxuaW1wb3J0IHsgVHJpbml0eU1hdGNobWFraW5nU3RhY2sgfSBmcm9tICcuLi9jbGVhbi9saWIvdHJpbml0eS1tYXRjaG1ha2luZy1zdGFjayc7XHJcblxyXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xyXG5cclxuLy8gQ29uZmlndXJhY2nDs24gcG9yIGRlZmVjdG9cclxuY29uc3QgZGVmYXVsdEVudiA9IHtcclxuICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxyXG4gIHJlZ2lvbjogJ2V1LXdlc3QtMScsIC8vIFJlZ2nDs24gZmlqYSBwYXJhIFRyaW5pdHlcclxufTtcclxuXHJcbi8vIFN0YWNrIGRlIGJhc2UgZGUgZGF0b3MgKER5bmFtb0RCKVxyXG5jb25zdCBkYXRhYmFzZVN0YWNrID0gbmV3IFRyaW5pdHlEYXRhYmFzZVN0YWNrKGFwcCwgJ1RyaW5pdHlEYXRhYmFzZVN0YWNrJywge1xyXG4gIGVudjogZGVmYXVsdEVudixcclxuICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgLSBEeW5hbW9EQiBUYWJsZXMgYW5kIERhdGFiYXNlIFJlc291cmNlcycsXHJcbn0pO1xyXG5cclxuLy8gU3RhY2sgZGUgZnVuY2lvbmVzIExhbWJkYVxyXG5jb25zdCBsYW1iZGFTdGFjayA9IG5ldyBUcmluaXR5TGFtYmRhU3RhY2soYXBwLCAnVHJpbml0eUxhbWJkYVN0YWNrJywge1xyXG4gIGVudjogZGVmYXVsdEVudixcclxuICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgLSBMYW1iZGEgRnVuY3Rpb25zJyxcclxuICAvLyBQYXNhciByZWZlcmVuY2lhcyBkZSB0YWJsYXNcclxuICB0YWJsZXM6IGRhdGFiYXNlU3RhY2sudGFibGVzLFxyXG59KTtcclxuXHJcbi8vIFN0YWNrIGRlIEFQSXMgKEFwcFN5bmMpXHJcbmNvbnN0IGFwaVN0YWNrID0gbmV3IFRyaW5pdHlBcGlTdGFjayhhcHAsICdUcmluaXR5QXBpU3RhY2snLCB7XHJcbiAgZW52OiBkZWZhdWx0RW52LFxyXG4gIGRlc2NyaXB0aW9uOiAnVHJpbml0eSAtIEdyYXBoUUwgQVBJcyBhbmQgQ29nbml0bycsXHJcbiAgLy8gUGFzYXIgcmVmZXJlbmNpYXMgZGUgbGFtYmRhc1xyXG4gIGxhbWJkYUZ1bmN0aW9uczogbGFtYmRhU3RhY2suZnVuY3Rpb25zLFxyXG59KTtcclxuXHJcbi8vIFN0YWNrIGRlIE1hdGNobWFraW5nIChWb3RlIENvbnNlbnN1cyAtIEluZGVwZW5kZW50KVxyXG5jb25zdCBtYXRjaG1ha2luZ1N0YWNrID0gbmV3IFRyaW5pdHlNYXRjaG1ha2luZ1N0YWNrKGFwcCwgJ1RyaW5pdHlNYXRjaG1ha2luZ1N0YWNrJywge1xyXG4gIGVudjogZGVmYXVsdEVudixcclxuICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgLSBWb3RlIENvbnNlbnN1cyBNYXRjaG1ha2luZyAoSW5kZXBlbmRlbnQpJyxcclxufSk7XHJcblxyXG4vLyBTdGFjayBwcmluY2lwYWwgKHJlY3Vyc29zIGNvbXBhcnRpZG9zKVxyXG5jb25zdCBtYWluU3RhY2sgPSBuZXcgVHJpbml0eU1haW5TdGFjayhhcHAsICdUcmluaXR5TWFpblN0YWNrJywge1xyXG4gIGVudjogZGVmYXVsdEVudixcclxuICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgLSBNYWluIEluZnJhc3RydWN0dXJlIGFuZCBTaGFyZWQgUmVzb3VyY2VzJyxcclxuICAvLyBQYXNhciByZWZlcmVuY2lhcyBkZSBvdHJvcyBzdGFja3NcclxuICBkYXRhYmFzZVN0YWNrLFxyXG4gIGxhbWJkYVN0YWNrLFxyXG4gIGFwaVN0YWNrLFxyXG59KTtcclxuXHJcbi8vIFRhZ3MgZ2xvYmFsZXNcclxuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoJ1Byb2plY3QnLCAnVHJpbml0eScpO1xyXG5jZGsuVGFncy5vZihhcHApLmFkZCgnRW52aXJvbm1lbnQnLCAnZGV2Jyk7XHJcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7XHJcbiJdfQ==