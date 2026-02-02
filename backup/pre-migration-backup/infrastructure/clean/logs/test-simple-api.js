#!/usr/bin/env node
"use strict";
/**
 * Simple test for API stack validation
 */
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
const appsync = __importStar(require("aws-cdk-lib/aws-appsync"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const environments_1 = require("./config/environments");
const app = new cdk.App();
const config = (0, environments_1.getEnvironmentConfig)('dev');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1zaW1wbGUtYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVzdC1zaW1wbGUtYXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7O0dBRUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUNuQyxpRUFBbUQ7QUFDbkQsaUVBQW1EO0FBQ25ELHdEQUE2RDtBQUU3RCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUMxQixNQUFNLE1BQU0sR0FBRyxJQUFBLG1DQUFvQixFQUFDLEtBQUssQ0FBQyxDQUFDO0FBRTNDLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO0lBQzVDLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtRQUN4QyxNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07S0FDdEI7Q0FDRixDQUFDLENBQUM7QUFFSCxrQ0FBa0M7QUFDbEMsTUFBTSxHQUFHLEdBQUcsSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUU7SUFDbkQsSUFBSSxFQUFFLFVBQVU7SUFDaEIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLG1EQUFtRCxDQUFDO0lBQ3pGLG1CQUFtQixFQUFFO1FBQ25CLG9CQUFvQixFQUFFO1lBQ3BCLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1NBQ3JEO0tBQ0Y7Q0FDRixDQUFDLENBQUM7QUFFSCxrQ0FBa0M7QUFDbEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxjQUFjLEVBQUU7SUFDM0QsWUFBWSxFQUFFLGdCQUFnQjtJQUM5QixhQUFhLEVBQUU7UUFDYixLQUFLLEVBQUUsSUFBSTtLQUNaO0lBQ0QsVUFBVSxFQUFFO1FBQ1YsS0FBSyxFQUFFLElBQUk7S0FDWjtDQUNGLENBQUMsQ0FBQztBQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsMkRBQTJELENBQUMsQ0FBQztBQUN6RSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbi8qKlxyXG4gKiBTaW1wbGUgdGVzdCBmb3IgQVBJIHN0YWNrIHZhbGlkYXRpb25cclxuICovXHJcblxyXG5pbXBvcnQgJ3NvdXJjZS1tYXAtc3VwcG9ydC9yZWdpc3Rlcic7XHJcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGFwcHN5bmMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcHN5bmMnO1xyXG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcclxuaW1wb3J0IHsgZ2V0RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2NvbmZpZy9lbnZpcm9ubWVudHMnO1xyXG5cclxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcclxuY29uc3QgY29uZmlnID0gZ2V0RW52aXJvbm1lbnRDb25maWcoJ2RldicpO1xyXG5cclxuY29uc3Qgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgJ1Rlc3RTdGFjaycsIHtcclxuICBlbnY6IHtcclxuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXHJcbiAgICByZWdpb246IGNvbmZpZy5yZWdpb24sXHJcbiAgfSxcclxufSk7XHJcblxyXG4vLyBUZXN0IGJhc2ljIEFwcFN5bmMgQVBJIGNyZWF0aW9uXHJcbmNvbnN0IGFwaSA9IG5ldyBhcHBzeW5jLkdyYXBocWxBcGkoc3RhY2ssICdUZXN0QXBpJywge1xyXG4gIG5hbWU6ICd0ZXN0LWFwaScsXHJcbiAgc2NoZW1hOiBhcHBzeW5jLlNjaGVtYUZpbGUuZnJvbUFzc2V0KCcuLi8uLi9hcGkvc2NoZW1hcy90cmluaXR5LXJlYWx0aW1lLXNjaGVtYS5ncmFwaHFsJyksXHJcbiAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xyXG4gICAgZGVmYXVsdEF1dGhvcml6YXRpb246IHtcclxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwcHN5bmMuQXV0aG9yaXphdGlvblR5cGUuQVBJX0tFWSxcclxuICAgIH0sXHJcbiAgfSxcclxufSk7XHJcblxyXG4vLyBUZXN0IENvZ25pdG8gVXNlciBQb29sIGNyZWF0aW9uXHJcbmNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2woc3RhY2ssICdUZXN0VXNlclBvb2wnLCB7XHJcbiAgdXNlclBvb2xOYW1lOiAndGVzdC11c2VyLXBvb2wnLFxyXG4gIHNpZ25JbkFsaWFzZXM6IHtcclxuICAgIGVtYWlsOiB0cnVlLFxyXG4gIH0sXHJcbiAgYXV0b1ZlcmlmeToge1xyXG4gICAgZW1haWw6IHRydWUsXHJcbiAgfSxcclxufSk7XHJcblxyXG5jb25zb2xlLmxvZygn4pyFIFNpbXBsZSBBUEkgYW5kIENvZ25pdG8gY29uc3RydWN0cyBjcmVhdGVkIHN1Y2Nlc3NmdWxseSEnKTtcclxuY29uc29sZS5sb2coJ/Cfk4ogQVBJIElEOicsIGFwaS5hcGlJZCk7XHJcbmNvbnNvbGUubG9nKCfwn5OKIFVzZXIgUG9vbCBJRDonLCB1c2VyUG9vbC51c2VyUG9vbElkKTsiXX0=