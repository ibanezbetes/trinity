#!/usr/bin/env npx ts-node
"use strict";
/**
 * Trinity Deployment Validation Script
 *
 * Comprehensive validation for Trinity deployments including:
 * - Pre-deployment environment checks
 * - Post-deployment resource validation
 * - Configuration consistency checks
 * - Security compliance validation
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
exports.TrinityDeploymentValidator = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_appsync_1 = require("@aws-sdk/client-appsync");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const deployment_configs_1 = require("../config/deployment-configs");
class TrinityDeploymentValidator {
    constructor(environment, region = 'eu-west-1') {
        this.results = [];
        this.config = (0, deployment_configs_1.getDeploymentConfig)(environment);
        this.config.region = region;
        this.cfClient = new client_cloudformation_1.CloudFormationClient({ region });
        this.dynamoClient = new client_dynamodb_1.DynamoDBClient({ region });
        this.appSyncClient = new client_appsync_1.AppSyncClient({ region });
        this.lambdaClient = new client_lambda_1.LambdaClient({ region });
    }
    addResult(category, test, status, message, details) {
        this.results.push({ category, test, status, message, details });
        const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
        console.log(`${icon} [${category}] ${test}: ${message}`);
    }
    /**
     * Validate pre-deployment environment
     */
    async validateEnvironment() {
        console.log('🔍 Validating deployment environment...\n');
        // Check AWS credentials
        try {
            await this.cfClient.send(new client_cloudformation_1.DescribeStacksCommand({}));
            this.addResult('Environment', 'AWS Credentials', 'pass', 'AWS credentials are valid');
        }
        catch (error) {
            this.addResult('Environment', 'AWS Credentials', 'fail', `AWS credentials invalid: ${error}`);
        }
        // Check CDK CLI
        try {
            const cdkVersion = (0, child_process_1.execSync)('cdk --version', { encoding: 'utf8' }).trim();
            this.addResult('Environment', 'CDK CLI', 'pass', `CDK CLI available: ${cdkVersion}`);
        }
        catch (error) {
            this.addResult('Environment', 'CDK CLI', 'fail', 'CDK CLI not available');
        }
        // Check Node.js version
        const nodeVersion = process.version;
        if (nodeVersion.startsWith('v18.')) {
            this.addResult('Environment', 'Node.js Version', 'pass', `Node.js version: ${nodeVersion}`);
        }
        else {
            this.addResult('Environment', 'Node.js Version', 'warn', `Node.js version ${nodeVersion} - recommended: v18.x`);
        }
        // Check CDK app configuration
        try {
            const cdkJson = JSON.parse(fs.readFileSync('cdk.json', 'utf8'));
            if (cdkJson.app) {
                this.addResult('Environment', 'CDK Configuration', 'pass', 'CDK app configuration valid');
            }
            else {
                this.addResult('Environment', 'CDK Configuration', 'fail', 'CDK app configuration missing');
            }
        }
        catch (error) {
            this.addResult('Environment', 'CDK Configuration', 'fail', `CDK configuration error: ${error}`);
        }
        // Check TypeScript compilation
        try {
            (0, child_process_1.execSync)('npm run build', { stdio: 'pipe' });
            this.addResult('Environment', 'TypeScript Build', 'pass', 'TypeScript compilation successful');
        }
        catch (error) {
            this.addResult('Environment', 'TypeScript Build', 'fail', 'TypeScript compilation failed');
        }
        // Validate deployment configuration
        const configIssues = (0, deployment_configs_1.validateDeploymentConfig)(this.config);
        if (configIssues.length === 0) {
            this.addResult('Environment', 'Deployment Config', 'pass', 'Deployment configuration valid');
        }
        else {
            this.addResult('Environment', 'Deployment Config', 'fail', `Configuration issues: ${configIssues.join(', ')}`);
        }
    }
    /**
     * Validate DynamoDB tables
     */
    async validateDynamoDBTables() {
        console.log('\n🗄️ Validating DynamoDB tables...\n');
        try {
            const tablesResponse = await this.dynamoClient.send(new client_dynamodb_1.ListTablesCommand({}));
            const existingTables = tablesResponse.TableNames || [];
            const expectedTables = [
                'trinity-users-dev',
                'trinity-rooms-dev-v2',
                'trinity-room-members-dev',
                'trinity-votes-dev',
                'trinity-movies-cache-dev',
                'trinity-room-matches-dev',
                'trinity-room-invites-dev-v2',
                'trinity-connections-dev',
                'trinity-room-movie-cache-dev',
                'trinity-room-cache-metadata-dev',
                'trinity-matchmaking-dev',
                'trinity-filter-cache'
            ];
            for (const expectedTable of expectedTables) {
                if (existingTables.includes(expectedTable)) {
                    try {
                        const tableDesc = await this.dynamoClient.send(new client_dynamodb_1.DescribeTableCommand({ TableName: expectedTable }));
                        if (tableDesc.Table?.TableStatus === 'ACTIVE') {
                            this.addResult('DynamoDB', expectedTable, 'pass', 'Table active and accessible');
                        }
                        else {
                            this.addResult('DynamoDB', expectedTable, 'warn', `Table status: ${tableDesc.Table?.TableStatus}`);
                        }
                        // Check encryption if required
                        if (this.config.security.enableEncryption) {
                            if (tableDesc.Table?.SSEDescription?.Status === 'ENABLED') {
                                this.addResult('DynamoDB', `${expectedTable} Encryption`, 'pass', 'Encryption enabled');
                            }
                            else {
                                this.addResult('DynamoDB', `${expectedTable} Encryption`, 'fail', 'Encryption not enabled');
                            }
                        }
                        // Check point-in-time recovery if required
                        if (this.config.security.enablePointInTimeRecovery) {
                            // Note: Would need additional API call to check PITR status
                            this.addResult('DynamoDB', `${expectedTable} PITR`, 'warn', 'PITR status not checked (requires additional permissions)');
                        }
                    }
                    catch (error) {
                        this.addResult('DynamoDB', expectedTable, 'fail', `Failed to describe table: ${error}`);
                    }
                }
                else {
                    this.addResult('DynamoDB', expectedTable, 'fail', 'Table not found');
                }
            }
            // Check for unexpected tables
            const unexpectedTables = existingTables.filter(table => table.startsWith('trinity-') && !expectedTables.includes(table));
            if (unexpectedTables.length > 0) {
                this.addResult('DynamoDB', 'Unexpected Tables', 'warn', `Found unexpected tables: ${unexpectedTables.join(', ')}`);
            }
        }
        catch (error) {
            this.addResult('DynamoDB', 'Table Validation', 'fail', `DynamoDB validation failed: ${error}`);
        }
    }
    /**
     * Validate Lambda functions
     */
    async validateLambdaFunctions() {
        console.log('\n⚡ Validating Lambda functions...\n');
        const expectedFunctions = [
            'trinity-auth-dev',
            'trinity-cache-dev',
            'trinity-vote-dev',
            'trinity-room-dev',
            'trinity-movie-dev',
            'trinity-realtime-dev',
            'trinity-matchmaker-dev'
        ];
        try {
            const functionsResponse = await this.lambdaClient.send(new client_lambda_1.ListFunctionsCommand({}));
            const existingFunctions = functionsResponse.Functions?.map(f => f.FunctionName) || [];
            for (const expectedFunction of expectedFunctions) {
                if (existingFunctions.includes(expectedFunction)) {
                    try {
                        const functionDesc = await this.lambdaClient.send(new client_lambda_1.GetFunctionCommand({ FunctionName: expectedFunction }));
                        if (functionDesc.Configuration?.State === 'Active') {
                            this.addResult('Lambda', expectedFunction, 'pass', 'Function active and ready');
                        }
                        else {
                            this.addResult('Lambda', expectedFunction, 'warn', `Function state: ${functionDesc.Configuration?.State}`);
                        }
                        // Check runtime
                        const runtime = functionDesc.Configuration?.Runtime;
                        if (runtime?.startsWith('nodejs18')) {
                            this.addResult('Lambda', `${expectedFunction} Runtime`, 'pass', `Runtime: ${runtime}`);
                        }
                        else {
                            this.addResult('Lambda', `${expectedFunction} Runtime`, 'warn', `Runtime: ${runtime} - recommended: nodejs18.x`);
                        }
                    }
                    catch (error) {
                        this.addResult('Lambda', expectedFunction, 'fail', `Failed to describe function: ${error}`);
                    }
                }
                else {
                    this.addResult('Lambda', expectedFunction, 'fail', 'Function not found');
                }
            }
        }
        catch (error) {
            this.addResult('Lambda', 'Function Validation', 'fail', `Lambda validation failed: ${error}`);
        }
    }
    /**
     * Validate AppSync APIs
     */
    async validateAppSyncAPIs() {
        console.log('\n🔗 Validating AppSync APIs...\n');
        try {
            const apisResponse = await this.appSyncClient.send(new client_appsync_1.ListGraphqlApisCommand({}));
            const existingAPIs = apisResponse.graphqlApis || [];
            const expectedAPIs = ['trinity-api-dev', 'trinity-realtime-api'];
            for (const expectedAPI of expectedAPIs) {
                const foundAPI = existingAPIs.find(api => api.name?.includes(expectedAPI));
                if (foundAPI) {
                    try {
                        const apiDesc = await this.appSyncClient.send(new client_appsync_1.GetGraphqlApiCommand({ apiId: foundAPI.apiId }));
                        if (apiDesc.graphqlApi?.apiId) {
                            this.addResult('AppSync', expectedAPI, 'pass', `API active: ${apiDesc.graphqlApi.uris?.GRAPHQL}`);
                        }
                    }
                    catch (error) {
                        this.addResult('AppSync', expectedAPI, 'fail', `Failed to describe API: ${error}`);
                    }
                }
                else {
                    this.addResult('AppSync', expectedAPI, 'fail', 'API not found');
                }
            }
        }
        catch (error) {
            this.addResult('AppSync', 'API Validation', 'fail', `AppSync validation failed: ${error}`);
        }
    }
    /**
     * Validate CloudFormation stacks
     */
    async validateCloudFormationStacks() {
        console.log('\n📦 Validating CloudFormation stacks...\n');
        for (const stackName of this.config.stacks) {
            try {
                const stackDesc = await this.cfClient.send(new client_cloudformation_1.DescribeStacksCommand({ StackName: stackName }));
                const stack = stackDesc.Stacks?.[0];
                if (stack) {
                    if (stack.StackStatus?.includes('COMPLETE')) {
                        this.addResult('CloudFormation', stackName, 'pass', `Stack status: ${stack.StackStatus}`);
                    }
                    else {
                        this.addResult('CloudFormation', stackName, 'warn', `Stack status: ${stack.StackStatus}`);
                    }
                    // Check stack outputs
                    if (stack.Outputs && stack.Outputs.length > 0) {
                        this.addResult('CloudFormation', `${stackName} Outputs`, 'pass', `${stack.Outputs.length} outputs available`);
                    }
                    else {
                        this.addResult('CloudFormation', `${stackName} Outputs`, 'warn', 'No stack outputs found');
                    }
                }
                else {
                    this.addResult('CloudFormation', stackName, 'fail', 'Stack not found');
                }
            }
            catch (error) {
                this.addResult('CloudFormation', stackName, 'fail', `Stack validation failed: ${error}`);
            }
        }
    }
    /**
     * Validate CDK outputs
     */
    validateCDKOutputs() {
        console.log('\n📋 Validating CDK outputs...\n');
        const outputsPath = 'cdk-outputs.json';
        if (fs.existsSync(outputsPath)) {
            try {
                const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
                const stackCount = Object.keys(outputs).length;
                if (stackCount > 0) {
                    this.addResult('CDK', 'Outputs File', 'pass', `${stackCount} stacks with outputs`);
                    // Check for required outputs
                    const requiredOutputs = ['GraphQLAPIEndpoint', 'UserPoolId', 'UserPoolClientId'];
                    let foundOutputs = 0;
                    for (const stackOutputs of Object.values(outputs)) {
                        const stackOutputKeys = Object.keys(stackOutputs);
                        foundOutputs += requiredOutputs.filter(required => stackOutputKeys.includes(required)).length;
                    }
                    if (foundOutputs >= requiredOutputs.length) {
                        this.addResult('CDK', 'Required Outputs', 'pass', 'All required outputs found');
                    }
                    else {
                        this.addResult('CDK', 'Required Outputs', 'warn', `Found ${foundOutputs}/${requiredOutputs.length} required outputs`);
                    }
                }
                else {
                    this.addResult('CDK', 'Outputs File', 'warn', 'CDK outputs file is empty');
                }
            }
            catch (error) {
                this.addResult('CDK', 'Outputs File', 'fail', `Failed to parse CDK outputs: ${error}`);
            }
        }
        else {
            this.addResult('CDK', 'Outputs File', 'fail', 'CDK outputs file not found');
        }
    }
    /**
     * Generate validation report
     */
    generateReport() {
        const summary = {
            total: this.results.length,
            passed: this.results.filter(r => r.status === 'pass').length,
            failed: this.results.filter(r => r.status === 'fail').length,
            warnings: this.results.filter(r => r.status === 'warn').length,
        };
        const overallStatus = summary.failed > 0 ? 'fail' :
            summary.warnings > 0 ? 'warn' : 'pass';
        const report = {
            timestamp: new Date().toISOString(),
            environment: this.config.environment,
            region: this.config.region,
            overallStatus,
            summary,
            results: this.results,
        };
        // Save report
        const reportPath = path.join('validation-reports', `validation-${Date.now()}.json`);
        if (!fs.existsSync('validation-reports')) {
            fs.mkdirSync('validation-reports', { recursive: true });
        }
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        // Print summary
        console.log('\n📊 Validation Summary:');
        console.log(`   ✅ Passed: ${summary.passed}`);
        console.log(`   ⚠️ Warnings: ${summary.warnings}`);
        console.log(`   ❌ Failed: ${summary.failed}`);
        console.log(`   📝 Total: ${summary.total}`);
        console.log(`   📋 Report: ${reportPath}`);
        console.log(`   🎯 Overall Status: ${overallStatus.toUpperCase()}`);
        return report;
    }
    /**
     * Execute full validation
     */
    async executeValidation(mode = 'post') {
        console.log(`🔍 Starting Trinity ${mode}-deployment validation...\n`);
        console.log(`📋 Environment: ${this.config.environment}`);
        console.log(`🌍 Region: ${this.config.region}\n`);
        // Always validate environment
        await this.validateEnvironment();
        if (mode === 'post') {
            // Post-deployment validations
            await this.validateCloudFormationStacks();
            await this.validateDynamoDBTables();
            await this.validateLambdaFunctions();
            await this.validateAppSyncAPIs();
            this.validateCDKOutputs();
        }
        return this.generateReport();
    }
}
exports.TrinityDeploymentValidator = TrinityDeploymentValidator;
// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
    const region = args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1';
    const mode = args.includes('--pre') ? 'pre' : 'post';
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Trinity Deployment Validation

Usage:
  npx ts-node validate-deployment.ts [options]

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --pre               Run pre-deployment validation only
  --help, -h          Show this help message

Examples:
  # Post-deployment validation (default)
  npx ts-node validate-deployment.ts --env=dev
  
  # Pre-deployment validation
  npx ts-node validate-deployment.ts --pre --env=production
  
  # Staging environment validation
  npx ts-node validate-deployment.ts --env=staging --region=eu-west-1
`);
        process.exit(0);
    }
    const validator = new TrinityDeploymentValidator(environment, region);
    validator.executeValidation(mode).then(report => {
        process.exit(report.overallStatus === 'fail' ? 1 : 0);
    }).catch(error => {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUtZGVwbG95bWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZhbGlkYXRlLWRlcGxveW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQTs7Ozs7Ozs7R0FRRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQXlDO0FBQ3pDLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsMEVBQXdIO0FBQ3hILDhEQUFtRztBQUNuRyw0REFBc0c7QUFDdEcsMERBQWdHO0FBQ2hHLHFFQUEwSDtBQXdCMUgsTUFBTSwwQkFBMEI7SUFROUIsWUFBWSxXQUFtQixFQUFFLFNBQWlCLFdBQVc7UUFGckQsWUFBTyxHQUF1QixFQUFFLENBQUM7UUFHdkMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFBLHdDQUFtQixFQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUU1QixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksNENBQW9CLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksOEJBQWEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDbkQsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFTyxTQUFTLENBQUMsUUFBZ0IsRUFBRSxJQUFZLEVBQUUsTUFBZ0MsRUFBRSxPQUFlLEVBQUUsT0FBYTtRQUNoSCxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyxD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LFdBQVcsQ0FBQztJQUMzRixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUVyRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ25ELE9BQU8sQ0FBQyxHQUFHLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQXFCZixDQUFDLENBQUM7UUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxNQUFNLFNBQVMsR0FBRyxJQUFJLDBCQUEwQixDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN0RSxTQUFTLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQzlDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEQsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5weCB0cy1ub2RlXHJcblxyXG4vKipcclxuICogVHJpbml0eSBEZXBsb3ltZW50IFZhbGlkYXRpb24gU2NyaXB0XHJcbiAqIFxyXG4gKiBDb21wcmVoZW5zaXZlIHZhbGlkYXRpb24gZm9yIFRyaW5pdHkgZGVwbG95bWVudHMgaW5jbHVkaW5nOlxyXG4gKiAtIFByZS1kZXBsb3ltZW50IGVudmlyb25tZW50IGNoZWNrc1xyXG4gKiAtIFBvc3QtZGVwbG95bWVudCByZXNvdXJjZSB2YWxpZGF0aW9uXHJcbiAqIC0gQ29uZmlndXJhdGlvbiBjb25zaXN0ZW5jeSBjaGVja3NcclxuICogLSBTZWN1cml0eSBjb21wbGlhbmNlIHZhbGlkYXRpb25cclxuICovXHJcblxyXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7IENsb3VkRm9ybWF0aW9uQ2xpZW50LCBEZXNjcmliZVN0YWNrc0NvbW1hbmQsIExpc3RTdGFja1Jlc291cmNlc0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtY2xvdWRmb3JtYXRpb24nO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCwgTGlzdFRhYmxlc0NvbW1hbmQsIERlc2NyaWJlVGFibGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcclxuaW1wb3J0IHsgQXBwU3luY0NsaWVudCwgTGlzdEdyYXBocWxBcGlzQ29tbWFuZCwgR2V0R3JhcGhxbEFwaUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtYXBwc3luYyc7XHJcbmltcG9ydCB7IExhbWJkYUNsaWVudCwgTGlzdEZ1bmN0aW9uc0NvbW1hbmQsIEdldEZ1bmN0aW9uQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1sYW1iZGEnO1xyXG5pbXBvcnQgeyBnZXREZXBsb3ltZW50Q29uZmlnLCB2YWxpZGF0ZURlcGxveW1lbnRDb25maWcsIERlcGxveW1lbnRFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2NvbmZpZy9kZXBsb3ltZW50LWNvbmZpZ3MnO1xyXG5cclxuaW50ZXJmYWNlIFZhbGlkYXRpb25SZXN1bHQge1xyXG4gIGNhdGVnb3J5OiBzdHJpbmc7XHJcbiAgdGVzdDogc3RyaW5nO1xyXG4gIHN0YXR1czogJ3Bhc3MnIHwgJ2ZhaWwnIHwgJ3dhcm4nO1xyXG4gIG1lc3NhZ2U6IHN0cmluZztcclxuICBkZXRhaWxzPzogYW55O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVmFsaWRhdGlvblJlcG9ydCB7XHJcbiAgdGltZXN0YW1wOiBzdHJpbmc7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICByZWdpb246IHN0cmluZztcclxuICBvdmVyYWxsU3RhdHVzOiAncGFzcycgfCAnZmFpbCcgfCAnd2Fybic7XHJcbiAgc3VtbWFyeToge1xyXG4gICAgdG90YWw6IG51bWJlcjtcclxuICAgIHBhc3NlZDogbnVtYmVyO1xyXG4gICAgZmFpbGVkOiBudW1iZXI7XHJcbiAgICB3YXJuaW5nczogbnVtYmVyO1xyXG4gIH07XHJcbiAgcmVzdWx0czogVmFsaWRhdGlvblJlc3VsdFtdO1xyXG59XHJcblxyXG5jbGFzcyBUcmluaXR5RGVwbG95bWVudFZhbGlkYXRvciB7XHJcbiAgcHJpdmF0ZSBjb25maWc6IERlcGxveW1lbnRFbnZpcm9ubWVudENvbmZpZztcclxuICBwcml2YXRlIGNmQ2xpZW50OiBDbG91ZEZvcm1hdGlvbkNsaWVudDtcclxuICBwcml2YXRlIGR5bmFtb0NsaWVudDogRHluYW1vREJDbGllbnQ7XHJcbiAgcHJpdmF0ZSBhcHBTeW5jQ2xpZW50OiBBcHBTeW5jQ2xpZW50O1xyXG4gIHByaXZhdGUgbGFtYmRhQ2xpZW50OiBMYW1iZGFDbGllbnQ7XHJcbiAgcHJpdmF0ZSByZXN1bHRzOiBWYWxpZGF0aW9uUmVzdWx0W10gPSBbXTtcclxuXHJcbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgcmVnaW9uOiBzdHJpbmcgPSAnZXUtd2VzdC0xJykge1xyXG4gICAgdGhpcy5jb25maWcgPSBnZXREZXBsb3ltZW50Q29uZmlnKGVudmlyb25tZW50KTtcclxuICAgIHRoaXMuY29uZmlnLnJlZ2lvbiA9IHJlZ2lvbjtcclxuICAgIFxyXG4gICAgdGhpcy5jZkNsaWVudCA9IG5ldyBDbG91ZEZvcm1hdGlvbkNsaWVudCh7IHJlZ2lvbiB9KTtcclxuICAgIHRoaXMuZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHsgcmVnaW9uIH0pO1xyXG4gICAgdGhpcy5hcHBTeW5jQ2xpZW50ID0gbmV3IEFwcFN5bmNDbGllbnQoeyByZWdpb24gfSk7XHJcbiAgICB0aGlzLmxhbWJkYUNsaWVudCA9IG5ldyBMYW1iZGFDbGllbnQoeyByZWdpb24gfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZFJlc3VsdChjYXRlZ29yeTogc3RyaW5nLCB0ZXN0OiBzdHJpbmcsIHN0YXR1czogJ3Bhc3MnIHwgJ2ZhaWwnIHwgJ3dhcm4nLCBtZXNzYWdlOiBzdHJpbmcsIGRldGFpbHM/OiBhbnkpIHtcclxuICAgIHRoaXMucmVzdWx0cy5wdXNoKHsgY2F0ZWdvcnksIHRlc3QsIHN0YXR1cywgbWVzc2FnZSwgZGV0YWlscyB9KTtcclxuICAgIFxyXG4gICAgY29uc3QgaWNvbiA9IHN0YXR1cyA9PT0gJ3Bhc3MnID8gJ+KchScgOiBzdGF0dXMgPT09ICdmYWlsJyA/ICfinYwnIDogJ+KaoO+4jyc7XHJcbiAgICBjb25zb2xlLmxvZyhgJHtpY29ufSBbJHtjYXRlZ29yeX1dICR7dGVzdH06ICR7bWVzc2FnZX1gKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIHByZS1kZXBsb3ltZW50IGVudmlyb25tZW50XHJcbiAgICovXHJcbiAgYXN5bmMgdmFsaWRhdGVFbnZpcm9ubWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5SNIFZhbGlkYXRpbmcgZGVwbG95bWVudCBlbnZpcm9ubWVudC4uLlxcbicpO1xyXG5cclxuICAgIC8vIENoZWNrIEFXUyBjcmVkZW50aWFsc1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5jZkNsaWVudC5zZW5kKG5ldyBEZXNjcmliZVN0YWNrc0NvbW1hbmQoe30pKTtcclxuICAgICAgdGhpcy5hZGRSZXN1bHQoJ0Vudmlyb25tZW50JywgJ0FXUyBDcmVkZW50aWFscycsICdwYXNzJywgJ0FXUyBjcmVkZW50aWFscyBhcmUgdmFsaWQnKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdFbnZpcm9ubWVudCcsICdBV1MgQ3JlZGVudGlhbHMnLCAnZmFpbCcsIGBBV1MgY3JlZGVudGlhbHMgaW52YWxpZDogJHtlcnJvcn1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBDREsgQ0xJXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjZGtWZXJzaW9uID0gZXhlY1N5bmMoJ2NkayAtLXZlcnNpb24nLCB7IGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpO1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnRW52aXJvbm1lbnQnLCAnQ0RLIENMSScsICdwYXNzJywgYENESyBDTEkgYXZhaWxhYmxlOiAke2Nka1ZlcnNpb259YCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnRW52aXJvbm1lbnQnLCAnQ0RLIENMSScsICdmYWlsJywgJ0NESyBDTEkgbm90IGF2YWlsYWJsZScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIE5vZGUuanMgdmVyc2lvblxyXG4gICAgY29uc3Qgbm9kZVZlcnNpb24gPSBwcm9jZXNzLnZlcnNpb247XHJcbiAgICBpZiAobm9kZVZlcnNpb24uc3RhcnRzV2l0aCgndjE4LicpKSB7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdFbnZpcm9ubWVudCcsICdOb2RlLmpzIFZlcnNpb24nLCAncGFzcycsIGBOb2RlLmpzIHZlcnNpb246ICR7bm9kZVZlcnNpb259YCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnRW52aXJvbm1lbnQnLCAnTm9kZS5qcyBWZXJzaW9uJywgJ3dhcm4nLCBgTm9kZS5qcyB2ZXJzaW9uICR7bm9kZVZlcnNpb259IC0gcmVjb21tZW5kZWQ6IHYxOC54YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgQ0RLIGFwcCBjb25maWd1cmF0aW9uXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjZGtKc29uID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoJ2Nkay5qc29uJywgJ3V0ZjgnKSk7XHJcbiAgICAgIGlmIChjZGtKc29uLmFwcCkge1xyXG4gICAgICAgIHRoaXMuYWRkUmVzdWx0KCdFbnZpcm9ubWVudCcsICdDREsgQ29uZmlndXJhdGlvbicsICdwYXNzJywgJ0NESyBhcHAgY29uZmlndXJhdGlvbiB2YWxpZCcpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuYWRkUmVzdWx0KCdFbnZpcm9ubWVudCcsICdDREsgQ29uZmlndXJhdGlvbicsICdmYWlsJywgJ0NESyBhcHAgY29uZmlndXJhdGlvbiBtaXNzaW5nJyk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdFbnZpcm9ubWVudCcsICdDREsgQ29uZmlndXJhdGlvbicsICdmYWlsJywgYENESyBjb25maWd1cmF0aW9uIGVycm9yOiAke2Vycm9yfWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIFR5cGVTY3JpcHQgY29tcGlsYXRpb25cclxuICAgIHRyeSB7XHJcbiAgICAgIGV4ZWNTeW5jKCducG0gcnVuIGJ1aWxkJywgeyBzdGRpbzogJ3BpcGUnIH0pO1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnRW52aXJvbm1lbnQnLCAnVHlwZVNjcmlwdCBCdWlsZCcsICdwYXNzJywgJ1R5cGVTY3JpcHQgY29tcGlsYXRpb24gc3VjY2Vzc2Z1bCcpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5hZGRSZXN1bHQoJ0Vudmlyb25tZW50JywgJ1R5cGVTY3JpcHQgQnVpbGQnLCAnZmFpbCcsICdUeXBlU2NyaXB0IGNvbXBpbGF0aW9uIGZhaWxlZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFZhbGlkYXRlIGRlcGxveW1lbnQgY29uZmlndXJhdGlvblxyXG4gICAgY29uc3QgY29uZmlnSXNzdWVzID0gdmFsaWRhdGVEZXBsb3ltZW50Q29uZmlnKHRoaXMuY29uZmlnKTtcclxuICAgIGlmIChjb25maWdJc3N1ZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdFbnZpcm9ubWVudCcsICdEZXBsb3ltZW50IENvbmZpZycsICdwYXNzJywgJ0RlcGxveW1lbnQgY29uZmlndXJhdGlvbiB2YWxpZCcpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5hZGRSZXN1bHQoJ0Vudmlyb25tZW50JywgJ0RlcGxveW1lbnQgQ29uZmlnJywgJ2ZhaWwnLCBgQ29uZmlndXJhdGlvbiBpc3N1ZXM6ICR7Y29uZmlnSXNzdWVzLmpvaW4oJywgJyl9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBEeW5hbW9EQiB0YWJsZXNcclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZUR5bmFtb0RCVGFibGVzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfl4TvuI8gVmFsaWRhdGluZyBEeW5hbW9EQiB0YWJsZXMuLi5cXG4nKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB0YWJsZXNSZXNwb25zZSA9IGF3YWl0IHRoaXMuZHluYW1vQ2xpZW50LnNlbmQobmV3IExpc3RUYWJsZXNDb21tYW5kKHt9KSk7XHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVzID0gdGFibGVzUmVzcG9uc2UuVGFibGVOYW1lcyB8fCBbXTtcclxuXHJcbiAgICAgIGNvbnN0IGV4cGVjdGVkVGFibGVzID0gW1xyXG4gICAgICAgICd0cmluaXR5LXVzZXJzLWRldicsXHJcbiAgICAgICAgJ3RyaW5pdHktcm9vbXMtZGV2LXYyJyxcclxuICAgICAgICAndHJpbml0eS1yb29tLW1lbWJlcnMtZGV2JyxcclxuICAgICAgICAndHJpbml0eS12b3Rlcy1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LW1vdmllcy1jYWNoZS1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LXJvb20tbWF0Y2hlcy1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LXJvb20taW52aXRlcy1kZXYtdjInLFxyXG4gICAgICAgICd0cmluaXR5LWNvbm5lY3Rpb25zLWRldicsXHJcbiAgICAgICAgJ3RyaW5pdHktcm9vbS1tb3ZpZS1jYWNoZS1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LXJvb20tY2FjaGUtbWV0YWRhdGEtZGV2JyxcclxuICAgICAgICAndHJpbml0eS1tYXRjaG1ha2luZy1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LWZpbHRlci1jYWNoZSdcclxuICAgICAgXTtcclxuXHJcbiAgICAgIGZvciAoY29uc3QgZXhwZWN0ZWRUYWJsZSBvZiBleHBlY3RlZFRhYmxlcykge1xyXG4gICAgICAgIGlmIChleGlzdGluZ1RhYmxlcy5pbmNsdWRlcyhleHBlY3RlZFRhYmxlKSkge1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgdGFibGVEZXNjID0gYXdhaXQgdGhpcy5keW5hbW9DbGllbnQuc2VuZChcclxuICAgICAgICAgICAgICBuZXcgRGVzY3JpYmVUYWJsZUNvbW1hbmQoeyBUYWJsZU5hbWU6IGV4cGVjdGVkVGFibGUgfSlcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0YWJsZURlc2MuVGFibGU/LlRhYmxlU3RhdHVzID09PSAnQUNUSVZFJykge1xyXG4gICAgICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdEeW5hbW9EQicsIGV4cGVjdGVkVGFibGUsICdwYXNzJywgJ1RhYmxlIGFjdGl2ZSBhbmQgYWNjZXNzaWJsZScpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdEeW5hbW9EQicsIGV4cGVjdGVkVGFibGUsICd3YXJuJywgYFRhYmxlIHN0YXR1czogJHt0YWJsZURlc2MuVGFibGU/LlRhYmxlU3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBlbmNyeXB0aW9uIGlmIHJlcXVpcmVkXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbmZpZy5zZWN1cml0eS5lbmFibGVFbmNyeXB0aW9uKSB7XHJcbiAgICAgICAgICAgICAgaWYgKHRhYmxlRGVzYy5UYWJsZT8uU1NFRGVzY3JpcHRpb24/LlN0YXR1cyA9PT0gJ0VOQUJMRUQnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnRHluYW1vREInLCBgJHtleHBlY3RlZFRhYmxlfSBFbmNyeXB0aW9uYCwgJ3Bhc3MnLCAnRW5jcnlwdGlvbiBlbmFibGVkJyk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdEeW5hbW9EQicsIGAke2V4cGVjdGVkVGFibGV9IEVuY3J5cHRpb25gLCAnZmFpbCcsICdFbmNyeXB0aW9uIG5vdCBlbmFibGVkJyk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBwb2ludC1pbi10aW1lIHJlY292ZXJ5IGlmIHJlcXVpcmVkXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbmZpZy5zZWN1cml0eS5lbmFibGVQb2ludEluVGltZVJlY292ZXJ5KSB7XHJcbiAgICAgICAgICAgICAgLy8gTm90ZTogV291bGQgbmVlZCBhZGRpdGlvbmFsIEFQSSBjYWxsIHRvIGNoZWNrIFBJVFIgc3RhdHVzXHJcbiAgICAgICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0R5bmFtb0RCJywgYCR7ZXhwZWN0ZWRUYWJsZX0gUElUUmAsICd3YXJuJywgJ1BJVFIgc3RhdHVzIG5vdCBjaGVja2VkIChyZXF1aXJlcyBhZGRpdGlvbmFsIHBlcm1pc3Npb25zKScpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0R5bmFtb0RCJywgZXhwZWN0ZWRUYWJsZSwgJ2ZhaWwnLCBgRmFpbGVkIHRvIGRlc2NyaWJlIHRhYmxlOiAke2Vycm9yfWApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnRHluYW1vREInLCBleHBlY3RlZFRhYmxlLCAnZmFpbCcsICdUYWJsZSBub3QgZm91bmQnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENoZWNrIGZvciB1bmV4cGVjdGVkIHRhYmxlc1xyXG4gICAgICBjb25zdCB1bmV4cGVjdGVkVGFibGVzID0gZXhpc3RpbmdUYWJsZXMuZmlsdGVyKHRhYmxlID0+IFxyXG4gICAgICAgIHRhYmxlLnN0YXJ0c1dpdGgoJ3RyaW5pdHktJykgJiYgIWV4cGVjdGVkVGFibGVzLmluY2x1ZGVzKHRhYmxlKVxyXG4gICAgICApO1xyXG5cclxuICAgICAgaWYgKHVuZXhwZWN0ZWRUYWJsZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHRoaXMuYWRkUmVzdWx0KCdEeW5hbW9EQicsICdVbmV4cGVjdGVkIFRhYmxlcycsICd3YXJuJywgYEZvdW5kIHVuZXhwZWN0ZWQgdGFibGVzOiAke3VuZXhwZWN0ZWRUYWJsZXMuam9pbignLCAnKX1gKTtcclxuICAgICAgfVxyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdEeW5hbW9EQicsICdUYWJsZSBWYWxpZGF0aW9uJywgJ2ZhaWwnLCBgRHluYW1vREIgdmFsaWRhdGlvbiBmYWlsZWQ6ICR7ZXJyb3J9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBMYW1iZGEgZnVuY3Rpb25zXHJcbiAgICovXHJcbiAgYXN5bmMgdmFsaWRhdGVMYW1iZGFGdW5jdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu4pqhIFZhbGlkYXRpbmcgTGFtYmRhIGZ1bmN0aW9ucy4uLlxcbicpO1xyXG5cclxuICAgIGNvbnN0IGV4cGVjdGVkRnVuY3Rpb25zID0gW1xyXG4gICAgICAndHJpbml0eS1hdXRoLWRldicsXHJcbiAgICAgICd0cmluaXR5LWNhY2hlLWRldicsXHJcbiAgICAgICd0cmluaXR5LXZvdGUtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1tb3ZpZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yZWFsdGltZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1tYXRjaG1ha2VyLWRldidcclxuICAgIF07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgZnVuY3Rpb25zUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmxhbWJkYUNsaWVudC5zZW5kKG5ldyBMaXN0RnVuY3Rpb25zQ29tbWFuZCh7fSkpO1xyXG4gICAgICBjb25zdCBleGlzdGluZ0Z1bmN0aW9ucyA9IGZ1bmN0aW9uc1Jlc3BvbnNlLkZ1bmN0aW9ucz8ubWFwKGYgPT4gZi5GdW5jdGlvbk5hbWUpIHx8IFtdO1xyXG5cclxuICAgICAgZm9yIChjb25zdCBleHBlY3RlZEZ1bmN0aW9uIG9mIGV4cGVjdGVkRnVuY3Rpb25zKSB7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nRnVuY3Rpb25zLmluY2x1ZGVzKGV4cGVjdGVkRnVuY3Rpb24pKSB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbkRlc2MgPSBhd2FpdCB0aGlzLmxhbWJkYUNsaWVudC5zZW5kKFxyXG4gICAgICAgICAgICAgIG5ldyBHZXRGdW5jdGlvbkNvbW1hbmQoeyBGdW5jdGlvbk5hbWU6IGV4cGVjdGVkRnVuY3Rpb24gfSlcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChmdW5jdGlvbkRlc2MuQ29uZmlndXJhdGlvbj8uU3RhdGUgPT09ICdBY3RpdmUnKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0xhbWJkYScsIGV4cGVjdGVkRnVuY3Rpb24sICdwYXNzJywgJ0Z1bmN0aW9uIGFjdGl2ZSBhbmQgcmVhZHknKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnTGFtYmRhJywgZXhwZWN0ZWRGdW5jdGlvbiwgJ3dhcm4nLCBgRnVuY3Rpb24gc3RhdGU6ICR7ZnVuY3Rpb25EZXNjLkNvbmZpZ3VyYXRpb24/LlN0YXRlfWApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBydW50aW1lXHJcbiAgICAgICAgICAgIGNvbnN0IHJ1bnRpbWUgPSBmdW5jdGlvbkRlc2MuQ29uZmlndXJhdGlvbj8uUnVudGltZTtcclxuICAgICAgICAgICAgaWYgKHJ1bnRpbWU/LnN0YXJ0c1dpdGgoJ25vZGVqczE4JykpIHtcclxuICAgICAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnTGFtYmRhJywgYCR7ZXhwZWN0ZWRGdW5jdGlvbn0gUnVudGltZWAsICdwYXNzJywgYFJ1bnRpbWU6ICR7cnVudGltZX1gKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnTGFtYmRhJywgYCR7ZXhwZWN0ZWRGdW5jdGlvbn0gUnVudGltZWAsICd3YXJuJywgYFJ1bnRpbWU6ICR7cnVudGltZX0gLSByZWNvbW1lbmRlZDogbm9kZWpzMTgueGApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0xhbWJkYScsIGV4cGVjdGVkRnVuY3Rpb24sICdmYWlsJywgYEZhaWxlZCB0byBkZXNjcmliZSBmdW5jdGlvbjogJHtlcnJvcn1gKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0xhbWJkYScsIGV4cGVjdGVkRnVuY3Rpb24sICdmYWlsJywgJ0Z1bmN0aW9uIG5vdCBmb3VuZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdMYW1iZGEnLCAnRnVuY3Rpb24gVmFsaWRhdGlvbicsICdmYWlsJywgYExhbWJkYSB2YWxpZGF0aW9uIGZhaWxlZDogJHtlcnJvcn1gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIEFwcFN5bmMgQVBJc1xyXG4gICAqL1xyXG4gIGFzeW5jIHZhbGlkYXRlQXBwU3luY0FQSXMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+UlyBWYWxpZGF0aW5nIEFwcFN5bmMgQVBJcy4uLlxcbicpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGFwaXNSZXNwb25zZSA9IGF3YWl0IHRoaXMuYXBwU3luY0NsaWVudC5zZW5kKG5ldyBMaXN0R3JhcGhxbEFwaXNDb21tYW5kKHt9KSk7XHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nQVBJcyA9IGFwaXNSZXNwb25zZS5ncmFwaHFsQXBpcyB8fCBbXTtcclxuXHJcbiAgICAgIGNvbnN0IGV4cGVjdGVkQVBJcyA9IFsndHJpbml0eS1hcGktZGV2JywgJ3RyaW5pdHktcmVhbHRpbWUtYXBpJ107XHJcbiAgICAgIFxyXG4gICAgICBmb3IgKGNvbnN0IGV4cGVjdGVkQVBJIG9mIGV4cGVjdGVkQVBJcykge1xyXG4gICAgICAgIGNvbnN0IGZvdW5kQVBJID0gZXhpc3RpbmdBUElzLmZpbmQoYXBpID0+IGFwaS5uYW1lPy5pbmNsdWRlcyhleHBlY3RlZEFQSSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChmb3VuZEFQSSkge1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgYXBpRGVzYyA9IGF3YWl0IHRoaXMuYXBwU3luY0NsaWVudC5zZW5kKFxyXG4gICAgICAgICAgICAgIG5ldyBHZXRHcmFwaHFsQXBpQ29tbWFuZCh7IGFwaUlkOiBmb3VuZEFQSS5hcGlJZCEgfSlcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChhcGlEZXNjLmdyYXBocWxBcGk/LmFwaUlkKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0FwcFN5bmMnLCBleHBlY3RlZEFQSSwgJ3Bhc3MnLCBgQVBJIGFjdGl2ZTogJHthcGlEZXNjLmdyYXBocWxBcGkudXJpcz8uR1JBUEhRTH1gKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdBcHBTeW5jJywgZXhwZWN0ZWRBUEksICdmYWlsJywgYEZhaWxlZCB0byBkZXNjcmliZSBBUEk6ICR7ZXJyb3J9YCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdBcHBTeW5jJywgZXhwZWN0ZWRBUEksICdmYWlsJywgJ0FQSSBub3QgZm91bmQnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnQXBwU3luYycsICdBUEkgVmFsaWRhdGlvbicsICdmYWlsJywgYEFwcFN5bmMgdmFsaWRhdGlvbiBmYWlsZWQ6ICR7ZXJyb3J9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBDbG91ZEZvcm1hdGlvbiBzdGFja3NcclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZUNsb3VkRm9ybWF0aW9uU3RhY2tzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfk6YgVmFsaWRhdGluZyBDbG91ZEZvcm1hdGlvbiBzdGFja3MuLi5cXG4nKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHN0YWNrTmFtZSBvZiB0aGlzLmNvbmZpZy5zdGFja3MpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBzdGFja0Rlc2MgPSBhd2FpdCB0aGlzLmNmQ2xpZW50LnNlbmQoXHJcbiAgICAgICAgICBuZXcgRGVzY3JpYmVTdGFja3NDb21tYW5kKHsgU3RhY2tOYW1lOiBzdGFja05hbWUgfSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCBzdGFjayA9IHN0YWNrRGVzYy5TdGFja3M/LlswXTtcclxuICAgICAgICBpZiAoc3RhY2spIHtcclxuICAgICAgICAgIGlmIChzdGFjay5TdGFja1N0YXR1cz8uaW5jbHVkZXMoJ0NPTVBMRVRFJykpIHtcclxuICAgICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0Nsb3VkRm9ybWF0aW9uJywgc3RhY2tOYW1lLCAncGFzcycsIGBTdGFjayBzdGF0dXM6ICR7c3RhY2suU3RhY2tTdGF0dXN9YCk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ2xvdWRGb3JtYXRpb24nLCBzdGFja05hbWUsICd3YXJuJywgYFN0YWNrIHN0YXR1czogJHtzdGFjay5TdGFja1N0YXR1c31gKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBDaGVjayBzdGFjayBvdXRwdXRzXHJcbiAgICAgICAgICBpZiAoc3RhY2suT3V0cHV0cyAmJiBzdGFjay5PdXRwdXRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0Nsb3VkRm9ybWF0aW9uJywgYCR7c3RhY2tOYW1lfSBPdXRwdXRzYCwgJ3Bhc3MnLCBgJHtzdGFjay5PdXRwdXRzLmxlbmd0aH0gb3V0cHV0cyBhdmFpbGFibGVgKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdDbG91ZEZvcm1hdGlvbicsIGAke3N0YWNrTmFtZX0gT3V0cHV0c2AsICd3YXJuJywgJ05vIHN0YWNrIG91dHB1dHMgZm91bmQnKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdDbG91ZEZvcm1hdGlvbicsIHN0YWNrTmFtZSwgJ2ZhaWwnLCAnU3RhY2sgbm90IGZvdW5kJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ2xvdWRGb3JtYXRpb24nLCBzdGFja05hbWUsICdmYWlsJywgYFN0YWNrIHZhbGlkYXRpb24gZmFpbGVkOiAke2Vycm9yfWApO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBDREsgb3V0cHV0c1xyXG4gICAqL1xyXG4gIHZhbGlkYXRlQ0RLT3V0cHV0cygpOiB2b2lkIHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OLIFZhbGlkYXRpbmcgQ0RLIG91dHB1dHMuLi5cXG4nKTtcclxuXHJcbiAgICBjb25zdCBvdXRwdXRzUGF0aCA9ICdjZGstb3V0cHV0cy5qc29uJztcclxuICAgIGlmIChmcy5leGlzdHNTeW5jKG91dHB1dHNQYXRoKSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IG91dHB1dHMgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhvdXRwdXRzUGF0aCwgJ3V0ZjgnKSk7XHJcbiAgICAgICAgY29uc3Qgc3RhY2tDb3VudCA9IE9iamVjdC5rZXlzKG91dHB1dHMpLmxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoc3RhY2tDb3VudCA+IDApIHtcclxuICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdDREsnLCAnT3V0cHV0cyBGaWxlJywgJ3Bhc3MnLCBgJHtzdGFja0NvdW50fSBzdGFja3Mgd2l0aCBvdXRwdXRzYCk7XHJcblxyXG4gICAgICAgICAgLy8gQ2hlY2sgZm9yIHJlcXVpcmVkIG91dHB1dHNcclxuICAgICAgICAgIGNvbnN0IHJlcXVpcmVkT3V0cHV0cyA9IFsnR3JhcGhRTEFQSUVuZHBvaW50JywgJ1VzZXJQb29sSWQnLCAnVXNlclBvb2xDbGllbnRJZCddO1xyXG4gICAgICAgICAgbGV0IGZvdW5kT3V0cHV0cyA9IDA7XHJcblxyXG4gICAgICAgICAgZm9yIChjb25zdCBzdGFja091dHB1dHMgb2YgT2JqZWN0LnZhbHVlcyhvdXRwdXRzKSkge1xyXG4gICAgICAgICAgICBjb25zdCBzdGFja091dHB1dEtleXMgPSBPYmplY3Qua2V5cyhzdGFja091dHB1dHMgYXMgb2JqZWN0KTtcclxuICAgICAgICAgICAgZm91bmRPdXRwdXRzICs9IHJlcXVpcmVkT3V0cHV0cy5maWx0ZXIocmVxdWlyZWQgPT4gc3RhY2tPdXRwdXRLZXlzLmluY2x1ZGVzKHJlcXVpcmVkKSkubGVuZ3RoO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChmb3VuZE91dHB1dHMgPj0gcmVxdWlyZWRPdXRwdXRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ0RLJywgJ1JlcXVpcmVkIE91dHB1dHMnLCAncGFzcycsICdBbGwgcmVxdWlyZWQgb3V0cHV0cyBmb3VuZCcpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0NESycsICdSZXF1aXJlZCBPdXRwdXRzJywgJ3dhcm4nLCBgRm91bmQgJHtmb3VuZE91dHB1dHN9LyR7cmVxdWlyZWRPdXRwdXRzLmxlbmd0aH0gcmVxdWlyZWQgb3V0cHV0c2ApO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0NESycsICdPdXRwdXRzIEZpbGUnLCAnd2FybicsICdDREsgb3V0cHV0cyBmaWxlIGlzIGVtcHR5Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ0RLJywgJ091dHB1dHMgRmlsZScsICdmYWlsJywgYEZhaWxlZCB0byBwYXJzZSBDREsgb3V0cHV0czogJHtlcnJvcn1gKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5hZGRSZXN1bHQoJ0NESycsICdPdXRwdXRzIEZpbGUnLCAnZmFpbCcsICdDREsgb3V0cHV0cyBmaWxlIG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgdmFsaWRhdGlvbiByZXBvcnRcclxuICAgKi9cclxuICBnZW5lcmF0ZVJlcG9ydCgpOiBWYWxpZGF0aW9uUmVwb3J0IHtcclxuICAgIGNvbnN0IHN1bW1hcnkgPSB7XHJcbiAgICAgIHRvdGFsOiB0aGlzLnJlc3VsdHMubGVuZ3RoLFxyXG4gICAgICBwYXNzZWQ6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ3Bhc3MnKS5sZW5ndGgsXHJcbiAgICAgIGZhaWxlZDogdGhpcy5yZXN1bHRzLmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnZmFpbCcpLmxlbmd0aCxcclxuICAgICAgd2FybmluZ3M6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ3dhcm4nKS5sZW5ndGgsXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IG92ZXJhbGxTdGF0dXM6ICdwYXNzJyB8ICdmYWlsJyB8ICd3YXJuJyA9IFxyXG4gICAgICBzdW1tYXJ5LmZhaWxlZCA+IDAgPyAnZmFpbCcgOiBcclxuICAgICAgc3VtbWFyeS53YXJuaW5ncyA+IDAgPyAnd2FybicgOiAncGFzcyc7XHJcblxyXG4gICAgY29uc3QgcmVwb3J0OiBWYWxpZGF0aW9uUmVwb3J0ID0ge1xyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHRoaXMuY29uZmlnLmVudmlyb25tZW50LFxyXG4gICAgICByZWdpb246IHRoaXMuY29uZmlnLnJlZ2lvbixcclxuICAgICAgb3ZlcmFsbFN0YXR1cyxcclxuICAgICAgc3VtbWFyeSxcclxuICAgICAgcmVzdWx0czogdGhpcy5yZXN1bHRzLFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBTYXZlIHJlcG9ydFxyXG4gICAgY29uc3QgcmVwb3J0UGF0aCA9IHBhdGguam9pbigndmFsaWRhdGlvbi1yZXBvcnRzJywgYHZhbGlkYXRpb24tJHtEYXRlLm5vdygpfS5qc29uYCk7XHJcbiAgICBcclxuICAgIGlmICghZnMuZXhpc3RzU3luYygndmFsaWRhdGlvbi1yZXBvcnRzJykpIHtcclxuICAgICAgZnMubWtkaXJTeW5jKCd2YWxpZGF0aW9uLXJlcG9ydHMnLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnMud3JpdGVGaWxlU3luYyhyZXBvcnRQYXRoLCBKU09OLnN0cmluZ2lmeShyZXBvcnQsIG51bGwsIDIpKTtcclxuXHJcbiAgICAvLyBQcmludCBzdW1tYXJ5XHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+TiiBWYWxpZGF0aW9uIFN1bW1hcnk6Jyk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIFBhc3NlZDogJHtzdW1tYXJ5LnBhc3NlZH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDimqDvuI8gV2FybmluZ3M6ICR7c3VtbWFyeS53YXJuaW5nc31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDinYwgRmFpbGVkOiAke3N1bW1hcnkuZmFpbGVkfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCfk50gVG90YWw6ICR7c3VtbWFyeS50b3RhbH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn5OLIFJlcG9ydDogJHtyZXBvcnRQYXRofWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCfjq8gT3ZlcmFsbCBTdGF0dXM6ICR7b3ZlcmFsbFN0YXR1cy50b1VwcGVyQ2FzZSgpfWApO1xyXG5cclxuICAgIHJldHVybiByZXBvcnQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFeGVjdXRlIGZ1bGwgdmFsaWRhdGlvblxyXG4gICAqL1xyXG4gIGFzeW5jIGV4ZWN1dGVWYWxpZGF0aW9uKG1vZGU6ICdwcmUnIHwgJ3Bvc3QnID0gJ3Bvc3QnKTogUHJvbWlzZTxWYWxpZGF0aW9uUmVwb3J0PiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+UjSBTdGFydGluZyBUcmluaXR5ICR7bW9kZX0tZGVwbG95bWVudCB2YWxpZGF0aW9uLi4uXFxuYCk7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+TiyBFbnZpcm9ubWVudDogJHt0aGlzLmNvbmZpZy5lbnZpcm9ubWVudH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn4yNIFJlZ2lvbjogJHt0aGlzLmNvbmZpZy5yZWdpb259XFxuYCk7XHJcblxyXG4gICAgLy8gQWx3YXlzIHZhbGlkYXRlIGVudmlyb25tZW50XHJcbiAgICBhd2FpdCB0aGlzLnZhbGlkYXRlRW52aXJvbm1lbnQoKTtcclxuXHJcbiAgICBpZiAobW9kZSA9PT0gJ3Bvc3QnKSB7XHJcbiAgICAgIC8vIFBvc3QtZGVwbG95bWVudCB2YWxpZGF0aW9uc1xyXG4gICAgICBhd2FpdCB0aGlzLnZhbGlkYXRlQ2xvdWRGb3JtYXRpb25TdGFja3MoKTtcclxuICAgICAgYXdhaXQgdGhpcy52YWxpZGF0ZUR5bmFtb0RCVGFibGVzKCk7XHJcbiAgICAgIGF3YWl0IHRoaXMudmFsaWRhdGVMYW1iZGFGdW5jdGlvbnMoKTtcclxuICAgICAgYXdhaXQgdGhpcy52YWxpZGF0ZUFwcFN5bmNBUElzKCk7XHJcbiAgICAgIHRoaXMudmFsaWRhdGVDREtPdXRwdXRzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVSZXBvcnQoKTtcclxuICB9XHJcbn1cclxuXHJcbi8vIENMSSBpbnRlcmZhY2VcclxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XHJcbiAgY29uc3QgYXJncyA9IHByb2Nlc3MuYXJndi5zbGljZSgyKTtcclxuICBcclxuICBjb25zdCBlbnZpcm9ubWVudCA9IGFyZ3MuZmluZChhcmcgPT4gYXJnLnN0YXJ0c1dpdGgoJy0tZW52PScpKT8uc3BsaXQoJz0nKVsxXSB8fCAnZGV2JztcclxuICBjb25zdCByZWdpb24gPSBhcmdzLmZpbmQoYXJnID0+IGFyZy5zdGFydHNXaXRoKCctLXJlZ2lvbj0nKSk/LnNwbGl0KCc9JylbMV0gfHwgJ2V1LXdlc3QtMSc7XHJcbiAgY29uc3QgbW9kZSA9IGFyZ3MuaW5jbHVkZXMoJy0tcHJlJykgPyAncHJlJyA6ICdwb3N0JztcclxuICBcclxuICBpZiAoYXJncy5pbmNsdWRlcygnLS1oZWxwJykgfHwgYXJncy5pbmNsdWRlcygnLWgnKSkge1xyXG4gICAgY29uc29sZS5sb2coYFxyXG5UcmluaXR5IERlcGxveW1lbnQgVmFsaWRhdGlvblxyXG5cclxuVXNhZ2U6XHJcbiAgbnB4IHRzLW5vZGUgdmFsaWRhdGUtZGVwbG95bWVudC50cyBbb3B0aW9uc11cclxuXHJcbk9wdGlvbnM6XHJcbiAgLS1lbnY9PGVudj4gICAgICAgICAgRW52aXJvbm1lbnQgKGRldnxzdGFnaW5nfHByb2R1Y3Rpb24pIFtkZWZhdWx0OiBkZXZdXHJcbiAgLS1yZWdpb249PHJlZ2lvbj4gICAgQVdTIHJlZ2lvbiBbZGVmYXVsdDogZXUtd2VzdC0xXVxyXG4gIC0tcHJlICAgICAgICAgICAgICAgUnVuIHByZS1kZXBsb3ltZW50IHZhbGlkYXRpb24gb25seVxyXG4gIC0taGVscCwgLWggICAgICAgICAgU2hvdyB0aGlzIGhlbHAgbWVzc2FnZVxyXG5cclxuRXhhbXBsZXM6XHJcbiAgIyBQb3N0LWRlcGxveW1lbnQgdmFsaWRhdGlvbiAoZGVmYXVsdClcclxuICBucHggdHMtbm9kZSB2YWxpZGF0ZS1kZXBsb3ltZW50LnRzIC0tZW52PWRldlxyXG4gIFxyXG4gICMgUHJlLWRlcGxveW1lbnQgdmFsaWRhdGlvblxyXG4gIG5weCB0cy1ub2RlIHZhbGlkYXRlLWRlcGxveW1lbnQudHMgLS1wcmUgLS1lbnY9cHJvZHVjdGlvblxyXG4gIFxyXG4gICMgU3RhZ2luZyBlbnZpcm9ubWVudCB2YWxpZGF0aW9uXHJcbiAgbnB4IHRzLW5vZGUgdmFsaWRhdGUtZGVwbG95bWVudC50cyAtLWVudj1zdGFnaW5nIC0tcmVnaW9uPWV1LXdlc3QtMVxyXG5gKTtcclxuICAgIHByb2Nlc3MuZXhpdCgwKTtcclxuICB9XHJcbiAgXHJcbiAgY29uc3QgdmFsaWRhdG9yID0gbmV3IFRyaW5pdHlEZXBsb3ltZW50VmFsaWRhdG9yKGVudmlyb25tZW50LCByZWdpb24pO1xyXG4gIHZhbGlkYXRvci5leGVjdXRlVmFsaWRhdGlvbihtb2RlKS50aGVuKHJlcG9ydCA9PiB7XHJcbiAgICBwcm9jZXNzLmV4aXQocmVwb3J0Lm92ZXJhbGxTdGF0dXMgPT09ICdmYWlsJyA/IDEgOiAwKTtcclxuICB9KS5jYXRjaChlcnJvciA9PiB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgVmFsaWRhdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gIH0pO1xyXG59XHJcblxyXG5leHBvcnQgeyBUcmluaXR5RGVwbG95bWVudFZhbGlkYXRvciwgVmFsaWRhdGlvblJlc3VsdCwgVmFsaWRhdGlvblJlcG9ydCB9OyJdfQ==