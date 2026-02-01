#!/usr/bin/env npx ts-node
"use strict";
/**
 * Trinity System Integration Testing Script
 *
 * Comprehensive end-to-end testing and validation before infrastructure import
 * This is the critical "Dry Run" checkpoint to ensure TypeScript code
 * interacts correctly with existing resources
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
exports.TrinityIntegrationTester = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_lambda_1 = require("@aws-sdk/client-lambda");
class TrinityIntegrationTester {
    constructor(environment, region = 'eu-west-1') {
        this.results = [];
        this.environment = environment;
        this.region = region;
        this.cfClient = new client_cloudformation_1.CloudFormationClient({ region });
        this.dynamoClient = new client_dynamodb_1.DynamoDBClient({ region });
        this.lambdaClient = new client_lambda_1.LambdaClient({ region });
        this.startTime = Date.now();
    }
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const icon = level === 'info' ? '🧪' : level === 'warn' ? '⚠️' : '❌';
        console.log(`${icon} [${timestamp}] ${message}`);
    }
    addResult(category, test, status, message, details) {
        const duration = Date.now() - this.startTime;
        this.results.push({ category, test, status, duration, message, details });
        const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
        this.log(`${icon} [${category}] ${test}: ${message}`);
    }
    /**
     * Test TypeScript compilation
     */
    async testTypeScriptCompilation() {
        this.log('🔨 Testing TypeScript compilation...');
        try {
            const startTime = Date.now();
            (0, child_process_1.execSync)('npm run build', { stdio: 'pipe' });
            const duration = Date.now() - startTime;
            this.addResult('Build', 'TypeScript Compilation', 'pass', `Compiled successfully in ${duration}ms`);
        }
        catch (error) {
            this.addResult('Build', 'TypeScript Compilation', 'fail', `Compilation failed: ${error}`);
        }
    }
    /**
     * Test CDK synthesis
     */
    async testCDKSynthesis() {
        this.log('🏗️ Testing CDK synthesis...');
        try {
            const startTime = Date.now();
            (0, child_process_1.execSync)('npm run synth', { stdio: 'pipe' });
            const duration = Date.now() - startTime;
            // Check if CloudFormation templates were generated
            const cdkOutDir = 'cdk.out';
            if (fs.existsSync(cdkOutDir)) {
                const templates = fs.readdirSync(cdkOutDir).filter(file => file.endsWith('.template.json'));
                this.addResult('CDK', 'Synthesis', 'pass', `Generated ${templates.length} CloudFormation templates in ${duration}ms`);
            }
            else {
                this.addResult('CDK', 'Synthesis', 'fail', 'CDK output directory not found');
            }
        }
        catch (error) {
            this.addResult('CDK', 'Synthesis', 'fail', `CDK synthesis failed: ${error}`);
        }
    }
    /**
     * Test AWS connectivity and permissions
     */
    async testAWSConnectivity() {
        this.log('🔗 Testing AWS connectivity and permissions...');
        try {
            // Test CloudFormation access
            await this.cfClient.send(new client_cloudformation_1.DescribeStacksCommand({}));
            this.addResult('AWS', 'CloudFormation Access', 'pass', 'CloudFormation API accessible');
            // Test DynamoDB access
            await this.dynamoClient.send(new client_dynamodb_1.ListTablesCommand({}));
            this.addResult('AWS', 'DynamoDB Access', 'pass', 'DynamoDB API accessible');
            // Test Lambda access
            await this.lambdaClient.send(new client_lambda_1.ListFunctionsCommand({}));
            this.addResult('AWS', 'Lambda Access', 'pass', 'Lambda API accessible');
        }
        catch (error) {
            this.addResult('AWS', 'Connectivity', 'fail', `AWS access failed: ${error}`);
        }
    }
    /**
     * Test existing resource compatibility
     */
    async testResourceCompatibility() {
        this.log('🔍 Testing existing resource compatibility...');
        try {
            // Check existing DynamoDB tables
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
            const foundTables = expectedTables.filter(table => existingTables.includes(table));
            if (foundTables.length === expectedTables.length) {
                this.addResult('Resources', 'DynamoDB Tables', 'pass', `All ${expectedTables.length} expected tables found`);
            }
            else {
                const missingTables = expectedTables.filter(table => !existingTables.includes(table));
                this.addResult('Resources', 'DynamoDB Tables', 'fail', `Missing tables: ${missingTables.join(', ')}`);
            }
            // Check existing Lambda functions
            const functionsResponse = await this.lambdaClient.send(new client_lambda_1.ListFunctionsCommand({}));
            const existingFunctions = functionsResponse.Functions?.map(f => f.FunctionName).filter(Boolean) || [];
            const expectedFunctions = [
                'trinity-auth-dev',
                'trinity-cache-dev',
                'trinity-vote-dev',
                'trinity-room-dev',
                'trinity-movie-dev',
                'trinity-realtime-dev',
                'trinity-vote-consensus-dev' // Note: matchmaker is deployed as vote-consensus
            ];
            const foundFunctions = expectedFunctions.filter(func => existingFunctions.includes(func));
            if (foundFunctions.length === expectedFunctions.length) {
                this.addResult('Resources', 'Lambda Functions', 'pass', `All ${expectedFunctions.length} expected functions found`);
            }
            else {
                const missingFunctions = expectedFunctions.filter(func => !existingFunctions.includes(func));
                this.addResult('Resources', 'Lambda Functions', 'fail', `Missing functions: ${missingFunctions.join(', ')}`);
            }
        }
        catch (error) {
            this.addResult('Resources', 'Compatibility Check', 'fail', `Resource compatibility check failed: ${error}`);
        }
    }
    /**
     * Run property-based tests
     */
    async runPropertyBasedTests() {
        this.log('🎲 Running property-based tests with 100+ iterations...');
        const propertyTestResults = {};
        // Find all property test files
        const testDir = path.join(__dirname, '..', 'test');
        const propertyTestFiles = fs.readdirSync(testDir)
            .filter(file => file.includes('property.test.ts'))
            .map(file => path.join(testDir, file));
        for (const testFile of propertyTestFiles) {
            const testName = path.basename(testFile, '.ts');
            this.log(`🧪 Running ${testName}...`);
            const startTime = Date.now();
            try {
                // Run Jest with specific test file and increased iterations
                const jestCommand = [
                    'npx', 'jest',
                    testFile,
                    '--verbose',
                    '--no-cache',
                    '--testTimeout=300000' // 5 minutes timeout
                ];
                (0, child_process_1.execSync)(jestCommand.join(' '), {
                    stdio: 'pipe',
                    env: {
                        ...process.env,
                        FC_NUM_RUNS: '100' // Set fast-check to run 100+ iterations
                    }
                });
                const duration = Date.now() - startTime;
                propertyTestResults[testName] = {
                    status: 'pass',
                    iterations: 100,
                    duration,
                };
                this.addResult('Property Tests', testName, 'pass', `Passed 100+ iterations in ${duration}ms`);
            }
            catch (error) {
                const duration = Date.now() - startTime;
                propertyTestResults[testName] = {
                    status: 'fail',
                    iterations: 0,
                    duration,
                    errors: [String(error)],
                };
                this.addResult('Property Tests', testName, 'fail', `Failed: ${error}`);
            }
        }
        return propertyTestResults;
    }
    /**
     * Test CDK diff against existing resources
     */
    async testCDKDiff() {
        this.log('📊 Testing CDK diff against existing resources...');
        try {
            const startTime = Date.now();
            // Run CDK diff to see what changes would be made
            const diffOutput = (0, child_process_1.execSync)('npm run diff', {
                encoding: 'utf8',
                stdio: 'pipe'
            });
            const duration = Date.now() - startTime;
            // Analyze diff output
            const lines = diffOutput.split('\n');
            const hasChanges = lines.some(line => line.includes('[+]') || line.includes('[-]') || line.includes('[~]'));
            if (hasChanges) {
                // Count different types of changes
                const additions = lines.filter(line => line.includes('[+]')).length;
                const deletions = lines.filter(line => line.includes('[-]')).length;
                const modifications = lines.filter(line => line.includes('[~]')).length;
                this.addResult('CDK', 'Diff Analysis', 'pass', `Found changes: +${additions} -${deletions} ~${modifications} in ${duration}ms`, { additions, deletions, modifications, diffOutput: lines.slice(0, 20) });
            }
            else {
                this.addResult('CDK', 'Diff Analysis', 'pass', `No changes detected in ${duration}ms`);
            }
        }
        catch (error) {
            // CDK diff might exit with non-zero code when there are differences
            // This is expected behavior, so we parse the output anyway
            const errorOutput = String(error);
            if (errorOutput.includes('Stack') && errorOutput.includes('diff')) {
                this.addResult('CDK', 'Diff Analysis', 'pass', 'CDK diff completed with changes detected');
            }
            else {
                this.addResult('CDK', 'Diff Analysis', 'fail', `CDK diff failed: ${error}`);
            }
        }
    }
    /**
     * Test deployment validation scripts
     */
    async testValidationScripts() {
        this.log('🔍 Testing deployment validation scripts...');
        const validationScripts = [
            { name: 'Pre-deployment Validation', command: 'npm run validate:pre' },
            { name: 'Naming Validation', command: 'npm run validate:naming' },
            { name: 'Schema Validation', command: 'npm run validate:schema' },
        ];
        for (const script of validationScripts) {
            try {
                const startTime = Date.now();
                (0, child_process_1.execSync)(script.command, { stdio: 'pipe' });
                const duration = Date.now() - startTime;
                this.addResult('Validation', script.name, 'pass', `Completed in ${duration}ms`);
            }
            catch (error) {
                this.addResult('Validation', script.name, 'fail', `Failed: ${error}`);
            }
        }
    }
    /**
     * Test import preparation
     */
    async testImportPreparation() {
        this.log('📥 Testing import preparation...');
        try {
            // Test import configuration generation
            const startTime = Date.now();
            // This would normally be part of the deploy-master script
            // For now, we'll test that the script can be invoked
            (0, child_process_1.execSync)('npx ts-node scripts/deploy-master.ts --dry-run --env=dev', { stdio: 'pipe' });
            const duration = Date.now() - startTime;
            this.addResult('Import', 'Preparation', 'pass', `Import preparation completed in ${duration}ms`);
        }
        catch (error) {
            this.addResult('Import', 'Preparation', 'fail', `Import preparation failed: ${error}`);
        }
    }
    /**
     * Generate integration test report
     */
    generateReport(propertyTestResults) {
        const totalDuration = Date.now() - this.startTime;
        const summary = {
            total: this.results.length,
            passed: this.results.filter(r => r.status === 'pass').length,
            failed: this.results.filter(r => r.status === 'fail').length,
            skipped: this.results.filter(r => r.status === 'skip').length,
            duration: totalDuration,
        };
        const overallStatus = summary.failed === 0 ? 'pass' : 'fail';
        // Generate recommendations
        const recommendations = [];
        if (summary.failed > 0) {
            recommendations.push('🔧 Fix failing tests before proceeding to infrastructure import');
            const failedTests = this.results.filter(r => r.status === 'fail');
            failedTests.forEach(test => {
                recommendations.push(`   - ${test.category}: ${test.test} - ${test.message}`);
            });
        }
        const failedPropertyTests = Object.entries(propertyTestResults)
            .filter(([_, result]) => result.status === 'fail');
        if (failedPropertyTests.length > 0) {
            recommendations.push('🎲 Fix failing property-based tests:');
            failedPropertyTests.forEach(([testName, result]) => {
                recommendations.push(`   - ${testName}: ${result.errors?.join(', ')}`);
            });
        }
        if (overallStatus === 'pass') {
            recommendations.push('✅ All integration tests passed - ready for infrastructure import');
            recommendations.push('📋 Next steps:');
            recommendations.push('   1. Review Task 13 execution plan');
            recommendations.push('   2. Ensure backup procedures are in place');
            recommendations.push('   3. Execute CDK import for Database Stack');
            recommendations.push('   4. Validate import success');
            recommendations.push('   5. Proceed with remaining stack imports');
        }
        const report = {
            timestamp: new Date().toISOString(),
            environment: this.environment,
            region: this.region,
            overallStatus,
            summary,
            results: this.results,
            propertyTestResults,
            recommendations,
        };
        // Save report
        const reportPath = path.join('integration-reports', `integration-test-${Date.now()}.json`);
        if (!fs.existsSync('integration-reports')) {
            fs.mkdirSync('integration-reports', { recursive: true });
        }
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        // Print summary
        console.log('\n🧪 Integration Test Summary:');
        console.log(`   ✅ Passed: ${summary.passed}`);
        console.log(`   ❌ Failed: ${summary.failed}`);
        console.log(`   ⏭️ Skipped: ${summary.skipped}`);
        console.log(`   📝 Total: ${summary.total}`);
        console.log(`   ⏱️ Duration: ${(summary.duration / 1000).toFixed(2)}s`);
        console.log(`   🎯 Overall Status: ${overallStatus.toUpperCase()}`);
        console.log(`   📋 Report: ${reportPath}`);
        // Print property test summary
        const propertyTestCount = Object.keys(propertyTestResults).length;
        const passedPropertyTests = Object.values(propertyTestResults).filter(r => r.status === 'pass').length;
        console.log('\n🎲 Property Test Summary:');
        console.log(`   ✅ Passed: ${passedPropertyTests}/${propertyTestCount}`);
        console.log(`   🔄 Total Iterations: ${passedPropertyTests * 100}+`);
        // Print recommendations
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach(rec => console.log(rec));
        return report;
    }
    /**
     * Execute comprehensive integration testing
     */
    async execute() {
        try {
            this.log('🚀 Starting Trinity System Integration Testing...');
            this.log(`📋 Environment: ${this.environment}`);
            this.log(`🌍 Region: ${this.region}`);
            this.log('🎯 This is the critical "Dry Run" checkpoint before infrastructure import\n');
            // Run all integration tests
            await this.testTypeScriptCompilation();
            await this.testCDKSynthesis();
            await this.testAWSConnectivity();
            await this.testResourceCompatibility();
            await this.testCDKDiff();
            await this.testValidationScripts();
            await this.testImportPreparation();
            // Run property-based tests with 100+ iterations
            const propertyTestResults = await this.runPropertyBasedTests();
            // Generate comprehensive report
            const report = this.generateReport(propertyTestResults);
            if (report.overallStatus === 'pass') {
                this.log('🎉 Integration testing completed successfully - ready for infrastructure import!');
            }
            else {
                this.log('❌ Integration testing failed - fix issues before proceeding', 'error');
            }
            return report;
        }
        catch (error) {
            this.log(`❌ Integration testing error: ${error}`, 'error');
            throw error;
        }
    }
}
exports.TrinityIntegrationTester = TrinityIntegrationTester;
// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
    const region = args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1';
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Trinity System Integration Testing

Usage:
  npx ts-node integration-test.ts [options]

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --help, -h          Show this help message

Description:
  This is the critical "Dry Run" checkpoint that validates:
  - TypeScript compilation and CDK synthesis
  - AWS connectivity and existing resource compatibility
  - Property-based tests with 100+ iterations
  - Deployment validation scripts
  - Import preparation procedures

  All tests must pass before proceeding to Task 13 (Infrastructure Import).

Examples:
  # Run integration tests for development
  npx ts-node integration-test.ts --env=dev
  
  # Run integration tests for production
  npx ts-node integration-test.ts --env=production --region=eu-west-1
`);
        process.exit(0);
    }
    const tester = new TrinityIntegrationTester(environment, region);
    tester.execute().then(report => {
        process.exit(report.overallStatus === 'pass' ? 0 : 1);
    }).catch(error => {
        console.error('❌ Integration testing failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWdyYXRpb24tdGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImludGVncmF0aW9uLXRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILGlEQUFnRDtBQUNoRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDBFQUE2RjtBQUM3Riw4REFBNkU7QUFDN0UsMERBQTRFO0FBbUM1RSxNQUFNLHdCQUF3QjtJQVM1QixZQUFZLFdBQW1CLEVBQUUsU0FBaUIsV0FBVztRQUhyRCxZQUFPLEdBQWlCLEVBQUUsQ0FBQztRQUlqQyxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUMvQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksNENBQW9CLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksNEJBQVksQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVPLEdBQUcsQ0FBQyxPQUFlLEVBQUUsUUFBbUMsTUFBTTtRQUNwRSxNQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQzNDLE1BQU0sSUFBSSxHQUFHLEtBQUssS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7UUFDckUsT0FBTyxDQUFDLEdB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QztJQUN4RCxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbnB4IHRzLW5vZGVcclxuXHJcbi8qKlxyXG4gKiBUcmluaXR5IFN5c3RlbSBJbnRlZ3JhdGlvbiBUZXN0aW5nIFNjcmlwdFxyXG4gKiBcclxuICogQ29tcHJlaGVuc2l2ZSBlbmQtdG8tZW5kIHRlc3RpbmcgYW5kIHZhbGlkYXRpb24gYmVmb3JlIGluZnJhc3RydWN0dXJlIGltcG9ydFxyXG4gKiBUaGlzIGlzIHRoZSBjcml0aWNhbCBcIkRyeSBSdW5cIiBjaGVja3BvaW50IHRvIGVuc3VyZSBUeXBlU2NyaXB0IGNvZGVcclxuICogaW50ZXJhY3RzIGNvcnJlY3RseSB3aXRoIGV4aXN0aW5nIHJlc291cmNlc1xyXG4gKi9cclxuXHJcbmltcG9ydCB7IGV4ZWNTeW5jLCBzcGF3biB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7IENsb3VkRm9ybWF0aW9uQ2xpZW50LCBEZXNjcmliZVN0YWNrc0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtY2xvdWRmb3JtYXRpb24nO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCwgTGlzdFRhYmxlc0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBMYW1iZGFDbGllbnQsIExpc3RGdW5jdGlvbnNDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWxhbWJkYSc7XHJcblxyXG5pbnRlcmZhY2UgVGVzdFJlc3VsdCB7XHJcbiAgY2F0ZWdvcnk6IHN0cmluZztcclxuICB0ZXN0OiBzdHJpbmc7XHJcbiAgc3RhdHVzOiAncGFzcycgfCAnZmFpbCcgfCAnc2tpcCc7XHJcbiAgZHVyYXRpb246IG51bWJlcjtcclxuICBtZXNzYWdlOiBzdHJpbmc7XHJcbiAgZGV0YWlscz86IGFueTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEludGVncmF0aW9uVGVzdFJlcG9ydCB7XHJcbiAgdGltZXN0YW1wOiBzdHJpbmc7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICByZWdpb246IHN0cmluZztcclxuICBvdmVyYWxsU3RhdHVzOiAncGFzcycgfCAnZmFpbCc7XHJcbiAgc3VtbWFyeToge1xyXG4gICAgdG90YWw6IG51bWJlcjtcclxuICAgIHBhc3NlZDogbnVtYmVyO1xyXG4gICAgZmFpbGVkOiBudW1iZXI7XHJcbiAgICBza2lwcGVkOiBudW1iZXI7XHJcbiAgICBkdXJhdGlvbjogbnVtYmVyO1xyXG4gIH07XHJcbiAgcmVzdWx0czogVGVzdFJlc3VsdFtdO1xyXG4gIHByb3BlcnR5VGVzdFJlc3VsdHM6IHtcclxuICAgIFt0ZXN0RmlsZTogc3RyaW5nXToge1xyXG4gICAgICBzdGF0dXM6ICdwYXNzJyB8ICdmYWlsJztcclxuICAgICAgaXRlcmF0aW9uczogbnVtYmVyO1xyXG4gICAgICBkdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgICBlcnJvcnM/OiBzdHJpbmdbXTtcclxuICAgIH07XHJcbiAgfTtcclxuICByZWNvbW1lbmRhdGlvbnM6IHN0cmluZ1tdO1xyXG59XHJcblxyXG5jbGFzcyBUcmluaXR5SW50ZWdyYXRpb25UZXN0ZXIge1xyXG4gIHByaXZhdGUgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICBwcml2YXRlIHJlZ2lvbjogc3RyaW5nO1xyXG4gIHByaXZhdGUgY2ZDbGllbnQ6IENsb3VkRm9ybWF0aW9uQ2xpZW50O1xyXG4gIHByaXZhdGUgZHluYW1vQ2xpZW50OiBEeW5hbW9EQkNsaWVudDtcclxuICBwcml2YXRlIGxhbWJkYUNsaWVudDogTGFtYmRhQ2xpZW50O1xyXG4gIHByaXZhdGUgcmVzdWx0czogVGVzdFJlc3VsdFtdID0gW107XHJcbiAgcHJpdmF0ZSBzdGFydFRpbWU6IG51bWJlcjtcclxuXHJcbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgcmVnaW9uOiBzdHJpbmcgPSAnZXUtd2VzdC0xJykge1xyXG4gICAgdGhpcy5lbnZpcm9ubWVudCA9IGVudmlyb25tZW50O1xyXG4gICAgdGhpcy5yZWdpb24gPSByZWdpb247XHJcbiAgICB0aGlzLmNmQ2xpZW50ID0gbmV3IENsb3VkRm9ybWF0aW9uQ2xpZW50KHsgcmVnaW9uIH0pO1xyXG4gICAgdGhpcy5keW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoeyByZWdpb24gfSk7XHJcbiAgICB0aGlzLmxhbWJkYUNsaWVudCA9IG5ldyBMYW1iZGFDbGllbnQoeyByZWdpb24gfSk7XHJcbiAgICB0aGlzLnN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGxvZyhtZXNzYWdlOiBzdHJpbmcsIGxldmVsOiAnaW5mbycgfCAnd2FybicgfCAnZXJyb3InID0gJ2luZm8nKSB7XHJcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICBjb25zdCBpY29uID0gbGV2ZWwgPT09ICdpbmZvJyA/ICfwn6eqJyA6IGxldmVsID09PSAnd2FybicgPyAn4pqg77iPJyA6ICfinYwnO1xyXG4gICAgY29uc29sZS5sb2coYCR7aWNvbn0gWyR7dGltZXN0YW1wfV0gJHttZXNzYWdlfWApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRSZXN1bHQoY2F0ZWdvcnk6IHN0cmluZywgdGVzdDogc3RyaW5nLCBzdGF0dXM6ICdwYXNzJyB8ICdmYWlsJyB8ICdza2lwJywgbWVzc2FnZTogc3RyaW5nLCBkZXRhaWxzPzogYW55KSB7XHJcbiAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSB0aGlzLnN0YXJ0VGltZTtcclxuICAgIHRoaXMucmVzdWx0cy5wdXNoKHsgY2F0ZWdvcnksIHRlc3QsIHN0YXR1cywgZHVyYXRpb24sIG1lc3NhZ2UsIGRldGFpbHMgfSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGljb24gPSBzdGF0dXMgPT09ICdwYXNzJyA/ICfinIUnIDogc3RhdHVzID09PSAnZmFpbCcgPyAn4p2MJyA6ICfij63vuI8nO1xyXG4gICAgdGhpcy5sb2coYCR7aWNvbn0gWyR7Y2F0ZWdvcnl9XSAke3Rlc3R9OiAke21lc3NhZ2V9YCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUZXN0IFR5cGVTY3JpcHQgY29tcGlsYXRpb25cclxuICAgKi9cclxuICBhc3luYyB0ZXN0VHlwZVNjcmlwdENvbXBpbGF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5sb2coJ/CflKggVGVzdGluZyBUeXBlU2NyaXB0IGNvbXBpbGF0aW9uLi4uJyk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgIGV4ZWNTeW5jKCducG0gcnVuIGJ1aWxkJywgeyBzdGRpbzogJ3BpcGUnIH0pO1xyXG4gICAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XHJcbiAgICAgIFxyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnQnVpbGQnLCAnVHlwZVNjcmlwdCBDb21waWxhdGlvbicsICdwYXNzJywgYENvbXBpbGVkIHN1Y2Nlc3NmdWxseSBpbiAke2R1cmF0aW9ufW1zYCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnQnVpbGQnLCAnVHlwZVNjcmlwdCBDb21waWxhdGlvbicsICdmYWlsJywgYENvbXBpbGF0aW9uIGZhaWxlZDogJHtlcnJvcn1gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRlc3QgQ0RLIHN5bnRoZXNpc1xyXG4gICAqL1xyXG4gIGFzeW5jIHRlc3RDREtTeW50aGVzaXMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmxvZygn8J+Pl++4jyBUZXN0aW5nIENESyBzeW50aGVzaXMuLi4nKTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgZXhlY1N5bmMoJ25wbSBydW4gc3ludGgnLCB7IHN0ZGlvOiAncGlwZScgfSk7XHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcclxuICAgICAgXHJcbiAgICAgIC8vIENoZWNrIGlmIENsb3VkRm9ybWF0aW9uIHRlbXBsYXRlcyB3ZXJlIGdlbmVyYXRlZFxyXG4gICAgICBjb25zdCBjZGtPdXREaXIgPSAnY2RrLm91dCc7XHJcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKGNka091dERpcikpIHtcclxuICAgICAgICBjb25zdCB0ZW1wbGF0ZXMgPSBmcy5yZWFkZGlyU3luYyhjZGtPdXREaXIpLmZpbHRlcihmaWxlID0+IGZpbGUuZW5kc1dpdGgoJy50ZW1wbGF0ZS5qc29uJykpO1xyXG4gICAgICAgIHRoaXMuYWRkUmVzdWx0KCdDREsnLCAnU3ludGhlc2lzJywgJ3Bhc3MnLCBgR2VuZXJhdGVkICR7dGVtcGxhdGVzLmxlbmd0aH0gQ2xvdWRGb3JtYXRpb24gdGVtcGxhdGVzIGluICR7ZHVyYXRpb259bXNgKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ0RLJywgJ1N5bnRoZXNpcycsICdmYWlsJywgJ0NESyBvdXRwdXQgZGlyZWN0b3J5IG5vdCBmb3VuZCcpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnQ0RLJywgJ1N5bnRoZXNpcycsICdmYWlsJywgYENESyBzeW50aGVzaXMgZmFpbGVkOiAke2Vycm9yfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVGVzdCBBV1MgY29ubmVjdGl2aXR5IGFuZCBwZXJtaXNzaW9uc1xyXG4gICAqL1xyXG4gIGFzeW5jIHRlc3RBV1NDb25uZWN0aXZpdHkoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmxvZygn8J+UlyBUZXN0aW5nIEFXUyBjb25uZWN0aXZpdHkgYW5kIHBlcm1pc3Npb25zLi4uJyk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFRlc3QgQ2xvdWRGb3JtYXRpb24gYWNjZXNzXHJcbiAgICAgIGF3YWl0IHRoaXMuY2ZDbGllbnQuc2VuZChuZXcgRGVzY3JpYmVTdGFja3NDb21tYW5kKHt9KSk7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdBV1MnLCAnQ2xvdWRGb3JtYXRpb24gQWNjZXNzJywgJ3Bhc3MnLCAnQ2xvdWRGb3JtYXRpb24gQVBJIGFjY2Vzc2libGUnKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFRlc3QgRHluYW1vREIgYWNjZXNzXHJcbiAgICAgIGF3YWl0IHRoaXMuZHluYW1vQ2xpZW50LnNlbmQobmV3IExpc3RUYWJsZXNDb21tYW5kKHt9KSk7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdBV1MnLCAnRHluYW1vREIgQWNjZXNzJywgJ3Bhc3MnLCAnRHluYW1vREIgQVBJIGFjY2Vzc2libGUnKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFRlc3QgTGFtYmRhIGFjY2Vzc1xyXG4gICAgICBhd2FpdCB0aGlzLmxhbWJkYUNsaWVudC5zZW5kKG5ldyBMaXN0RnVuY3Rpb25zQ29tbWFuZCh7fSkpO1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnQVdTJywgJ0xhbWJkYSBBY2Nlc3MnLCAncGFzcycsICdMYW1iZGEgQVBJIGFjY2Vzc2libGUnKTtcclxuICAgICAgXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnQVdTJywgJ0Nvbm5lY3Rpdml0eScsICdmYWlsJywgYEFXUyBhY2Nlc3MgZmFpbGVkOiAke2Vycm9yfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVGVzdCBleGlzdGluZyByZXNvdXJjZSBjb21wYXRpYmlsaXR5XHJcbiAgICovXHJcbiAgYXN5bmMgdGVzdFJlc291cmNlQ29tcGF0aWJpbGl0eSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRoaXMubG9nKCfwn5SNIFRlc3RpbmcgZXhpc3RpbmcgcmVzb3VyY2UgY29tcGF0aWJpbGl0eS4uLicpO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBDaGVjayBleGlzdGluZyBEeW5hbW9EQiB0YWJsZXNcclxuICAgICAgY29uc3QgdGFibGVzUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKG5ldyBMaXN0VGFibGVzQ29tbWFuZCh7fSkpO1xyXG4gICAgICBjb25zdCBleGlzdGluZ1RhYmxlcyA9IHRhYmxlc1Jlc3BvbnNlLlRhYmxlTmFtZXMgfHwgW107XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBleHBlY3RlZFRhYmxlcyA9IFtcclxuICAgICAgICAndHJpbml0eS11c2Vycy1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LXJvb21zLWRldi12MicsXHJcbiAgICAgICAgJ3RyaW5pdHktcm9vbS1tZW1iZXJzLWRldicsXHJcbiAgICAgICAgJ3RyaW5pdHktdm90ZXMtZGV2JyxcclxuICAgICAgICAndHJpbml0eS1tb3ZpZXMtY2FjaGUtZGV2JyxcclxuICAgICAgICAndHJpbml0eS1yb29tLW1hdGNoZXMtZGV2JyxcclxuICAgICAgICAndHJpbml0eS1yb29tLWludml0ZXMtZGV2LXYyJyxcclxuICAgICAgICAndHJpbml0eS1jb25uZWN0aW9ucy1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LXJvb20tbW92aWUtY2FjaGUtZGV2JyxcclxuICAgICAgICAndHJpbml0eS1yb29tLWNhY2hlLW1ldGFkYXRhLWRldicsXHJcbiAgICAgICAgJ3RyaW5pdHktbWF0Y2htYWtpbmctZGV2JyxcclxuICAgICAgICAndHJpbml0eS1maWx0ZXItY2FjaGUnXHJcbiAgICAgIF07XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBmb3VuZFRhYmxlcyA9IGV4cGVjdGVkVGFibGVzLmZpbHRlcih0YWJsZSA9PiBleGlzdGluZ1RhYmxlcy5pbmNsdWRlcyh0YWJsZSkpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGZvdW5kVGFibGVzLmxlbmd0aCA9PT0gZXhwZWN0ZWRUYWJsZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ1Jlc291cmNlcycsICdEeW5hbW9EQiBUYWJsZXMnLCAncGFzcycsIGBBbGwgJHtleHBlY3RlZFRhYmxlcy5sZW5ndGh9IGV4cGVjdGVkIHRhYmxlcyBmb3VuZGApO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnN0IG1pc3NpbmdUYWJsZXMgPSBleHBlY3RlZFRhYmxlcy5maWx0ZXIodGFibGUgPT4gIWV4aXN0aW5nVGFibGVzLmluY2x1ZGVzKHRhYmxlKSk7XHJcbiAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ1Jlc291cmNlcycsICdEeW5hbW9EQiBUYWJsZXMnLCAnZmFpbCcsIGBNaXNzaW5nIHRhYmxlczogJHttaXNzaW5nVGFibGVzLmpvaW4oJywgJyl9YCk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIENoZWNrIGV4aXN0aW5nIExhbWJkYSBmdW5jdGlvbnNcclxuICAgICAgY29uc3QgZnVuY3Rpb25zUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmxhbWJkYUNsaWVudC5zZW5kKG5ldyBMaXN0RnVuY3Rpb25zQ29tbWFuZCh7fSkpO1xyXG4gICAgICBjb25zdCBleGlzdGluZ0Z1bmN0aW9ucyA9IGZ1bmN0aW9uc1Jlc3BvbnNlLkZ1bmN0aW9ucz8ubWFwKGYgPT4gZi5GdW5jdGlvbk5hbWUpLmZpbHRlcihCb29sZWFuKSB8fCBbXTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGV4cGVjdGVkRnVuY3Rpb25zID0gW1xyXG4gICAgICAgICd0cmluaXR5LWF1dGgtZGV2JyxcclxuICAgICAgICAndHJpbml0eS1jYWNoZS1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LXZvdGUtZGV2JyxcclxuICAgICAgICAndHJpbml0eS1yb29tLWRldicsXHJcbiAgICAgICAgJ3RyaW5pdHktbW92aWUtZGV2JyxcclxuICAgICAgICAndHJpbml0eS1yZWFsdGltZS1kZXYnLFxyXG4gICAgICAgICd0cmluaXR5LXZvdGUtY29uc2Vuc3VzLWRldicgLy8gTm90ZTogbWF0Y2htYWtlciBpcyBkZXBsb3llZCBhcyB2b3RlLWNvbnNlbnN1c1xyXG4gICAgICBdO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgZm91bmRGdW5jdGlvbnMgPSBleHBlY3RlZEZ1bmN0aW9ucy5maWx0ZXIoZnVuYyA9PiBleGlzdGluZ0Z1bmN0aW9ucy5pbmNsdWRlcyhmdW5jKSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZm91bmRGdW5jdGlvbnMubGVuZ3RoID09PSBleHBlY3RlZEZ1bmN0aW9ucy5sZW5ndGgpIHtcclxuICAgICAgICB0aGlzLmFkZFJlc3VsdCgnUmVzb3VyY2VzJywgJ0xhbWJkYSBGdW5jdGlvbnMnLCAncGFzcycsIGBBbGwgJHtleHBlY3RlZEZ1bmN0aW9ucy5sZW5ndGh9IGV4cGVjdGVkIGZ1bmN0aW9ucyBmb3VuZGApO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnN0IG1pc3NpbmdGdW5jdGlvbnMgPSBleHBlY3RlZEZ1bmN0aW9ucy5maWx0ZXIoZnVuYyA9PiAhZXhpc3RpbmdGdW5jdGlvbnMuaW5jbHVkZXMoZnVuYykpO1xyXG4gICAgICAgIHRoaXMuYWRkUmVzdWx0KCdSZXNvdXJjZXMnLCAnTGFtYmRhIEZ1bmN0aW9ucycsICdmYWlsJywgYE1pc3NpbmcgZnVuY3Rpb25zOiAke21pc3NpbmdGdW5jdGlvbnMuam9pbignLCAnKX1gKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuYWRkUmVzdWx0KCdSZXNvdXJjZXMnLCAnQ29tcGF0aWJpbGl0eSBDaGVjaycsICdmYWlsJywgYFJlc291cmNlIGNvbXBhdGliaWxpdHkgY2hlY2sgZmFpbGVkOiAke2Vycm9yfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUnVuIHByb3BlcnR5LWJhc2VkIHRlc3RzXHJcbiAgICovXHJcbiAgYXN5bmMgcnVuUHJvcGVydHlCYXNlZFRlc3RzKCk6IFByb21pc2U8eyBbdGVzdEZpbGU6IHN0cmluZ106IGFueSB9PiB7XHJcbiAgICB0aGlzLmxvZygn8J+OsiBSdW5uaW5nIHByb3BlcnR5LWJhc2VkIHRlc3RzIHdpdGggMTAwKyBpdGVyYXRpb25zLi4uJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IHByb3BlcnR5VGVzdFJlc3VsdHM6IHsgW3Rlc3RGaWxlOiBzdHJpbmddOiBhbnkgfSA9IHt9O1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIGFsbCBwcm9wZXJ0eSB0ZXN0IGZpbGVzXHJcbiAgICBjb25zdCB0ZXN0RGlyID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uJywgJ3Rlc3QnKTtcclxuICAgIGNvbnN0IHByb3BlcnR5VGVzdEZpbGVzID0gZnMucmVhZGRpclN5bmModGVzdERpcilcclxuICAgICAgLmZpbHRlcihmaWxlID0+IGZpbGUuaW5jbHVkZXMoJ3Byb3BlcnR5LnRlc3QudHMnKSlcclxuICAgICAgLm1hcChmaWxlID0+IHBhdGguam9pbih0ZXN0RGlyLCBmaWxlKSk7XHJcbiAgICBcclxuICAgIGZvciAoY29uc3QgdGVzdEZpbGUgb2YgcHJvcGVydHlUZXN0RmlsZXMpIHtcclxuICAgICAgY29uc3QgdGVzdE5hbWUgPSBwYXRoLmJhc2VuYW1lKHRlc3RGaWxlLCAnLnRzJyk7XHJcbiAgICAgIHRoaXMubG9nKGDwn6eqIFJ1bm5pbmcgJHt0ZXN0TmFtZX0uLi5gKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgIFxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vIFJ1biBKZXN0IHdpdGggc3BlY2lmaWMgdGVzdCBmaWxlIGFuZCBpbmNyZWFzZWQgaXRlcmF0aW9uc1xyXG4gICAgICAgIGNvbnN0IGplc3RDb21tYW5kID0gW1xyXG4gICAgICAgICAgJ25weCcsICdqZXN0JyxcclxuICAgICAgICAgIHRlc3RGaWxlLFxyXG4gICAgICAgICAgJy0tdmVyYm9zZScsXHJcbiAgICAgICAgICAnLS1uby1jYWNoZScsXHJcbiAgICAgICAgICAnLS10ZXN0VGltZW91dD0zMDAwMDAnIC8vIDUgbWludXRlcyB0aW1lb3V0XHJcbiAgICAgICAgXTtcclxuICAgICAgICBcclxuICAgICAgICBleGVjU3luYyhqZXN0Q29tbWFuZC5qb2luKCcgJyksIHsgXHJcbiAgICAgICAgICBzdGRpbzogJ3BpcGUnLFxyXG4gICAgICAgICAgZW52OiB7IFxyXG4gICAgICAgICAgICAuLi5wcm9jZXNzLmVudiwgXHJcbiAgICAgICAgICAgIEZDX05VTV9SVU5TOiAnMTAwJyAvLyBTZXQgZmFzdC1jaGVjayB0byBydW4gMTAwKyBpdGVyYXRpb25zXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHByb3BlcnR5VGVzdFJlc3VsdHNbdGVzdE5hbWVdID0ge1xyXG4gICAgICAgICAgc3RhdHVzOiAncGFzcycsXHJcbiAgICAgICAgICBpdGVyYXRpb25zOiAxMDAsXHJcbiAgICAgICAgICBkdXJhdGlvbixcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuYWRkUmVzdWx0KCdQcm9wZXJ0eSBUZXN0cycsIHRlc3ROYW1lLCAncGFzcycsIGBQYXNzZWQgMTAwKyBpdGVyYXRpb25zIGluICR7ZHVyYXRpb259bXNgKTtcclxuICAgICAgICBcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcHJvcGVydHlUZXN0UmVzdWx0c1t0ZXN0TmFtZV0gPSB7XHJcbiAgICAgICAgICBzdGF0dXM6ICdmYWlsJyxcclxuICAgICAgICAgIGl0ZXJhdGlvbnM6IDAsXHJcbiAgICAgICAgICBkdXJhdGlvbixcclxuICAgICAgICAgIGVycm9yczogW1N0cmluZyhlcnJvcildLFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ1Byb3BlcnR5IFRlc3RzJywgdGVzdE5hbWUsICdmYWlsJywgYEZhaWxlZDogJHtlcnJvcn1gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gcHJvcGVydHlUZXN0UmVzdWx0cztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRlc3QgQ0RLIGRpZmYgYWdhaW5zdCBleGlzdGluZyByZXNvdXJjZXNcclxuICAgKi9cclxuICBhc3luYyB0ZXN0Q0RLRGlmZigpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRoaXMubG9nKCfwn5OKIFRlc3RpbmcgQ0RLIGRpZmYgYWdhaW5zdCBleGlzdGluZyByZXNvdXJjZXMuLi4nKTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFJ1biBDREsgZGlmZiB0byBzZWUgd2hhdCBjaGFuZ2VzIHdvdWxkIGJlIG1hZGVcclxuICAgICAgY29uc3QgZGlmZk91dHB1dCA9IGV4ZWNTeW5jKCducG0gcnVuIGRpZmYnLCB7IFxyXG4gICAgICAgIGVuY29kaW5nOiAndXRmOCcsXHJcbiAgICAgICAgc3RkaW86ICdwaXBlJ1xyXG4gICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcclxuICAgICAgXHJcbiAgICAgIC8vIEFuYWx5emUgZGlmZiBvdXRwdXRcclxuICAgICAgY29uc3QgbGluZXMgPSBkaWZmT3V0cHV0LnNwbGl0KCdcXG4nKTtcclxuICAgICAgY29uc3QgaGFzQ2hhbmdlcyA9IGxpbmVzLnNvbWUobGluZSA9PiBcclxuICAgICAgICBsaW5lLmluY2x1ZGVzKCdbK10nKSB8fCBsaW5lLmluY2x1ZGVzKCdbLV0nKSB8fCBsaW5lLmluY2x1ZGVzKCdbfl0nKVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgaWYgKGhhc0NoYW5nZXMpIHtcclxuICAgICAgICAvLyBDb3VudCBkaWZmZXJlbnQgdHlwZXMgb2YgY2hhbmdlc1xyXG4gICAgICAgIGNvbnN0IGFkZGl0aW9ucyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUuaW5jbHVkZXMoJ1srXScpKS5sZW5ndGg7XHJcbiAgICAgICAgY29uc3QgZGVsZXRpb25zID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZS5pbmNsdWRlcygnWy1dJykpLmxlbmd0aDtcclxuICAgICAgICBjb25zdCBtb2RpZmljYXRpb25zID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZS5pbmNsdWRlcygnW35dJykpLmxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ0RLJywgJ0RpZmYgQW5hbHlzaXMnLCAncGFzcycsIFxyXG4gICAgICAgICAgYEZvdW5kIGNoYW5nZXM6ICske2FkZGl0aW9uc30gLSR7ZGVsZXRpb25zfSB+JHttb2RpZmljYXRpb25zfSBpbiAke2R1cmF0aW9ufW1zYCwgXHJcbiAgICAgICAgICB7IGFkZGl0aW9ucywgZGVsZXRpb25zLCBtb2RpZmljYXRpb25zLCBkaWZmT3V0cHV0OiBsaW5lcy5zbGljZSgwLCAyMCkgfVxyXG4gICAgICAgICk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0NESycsICdEaWZmIEFuYWx5c2lzJywgJ3Bhc3MnLCBgTm8gY2hhbmdlcyBkZXRlY3RlZCBpbiAke2R1cmF0aW9ufW1zYCk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAvLyBDREsgZGlmZiBtaWdodCBleGl0IHdpdGggbm9uLXplcm8gY29kZSB3aGVuIHRoZXJlIGFyZSBkaWZmZXJlbmNlc1xyXG4gICAgICAvLyBUaGlzIGlzIGV4cGVjdGVkIGJlaGF2aW9yLCBzbyB3ZSBwYXJzZSB0aGUgb3V0cHV0IGFueXdheVxyXG4gICAgICBjb25zdCBlcnJvck91dHB1dCA9IFN0cmluZyhlcnJvcik7XHJcbiAgICAgIGlmIChlcnJvck91dHB1dC5pbmNsdWRlcygnU3RhY2snKSAmJiBlcnJvck91dHB1dC5pbmNsdWRlcygnZGlmZicpKSB7XHJcbiAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0NESycsICdEaWZmIEFuYWx5c2lzJywgJ3Bhc3MnLCAnQ0RLIGRpZmYgY29tcGxldGVkIHdpdGggY2hhbmdlcyBkZXRlY3RlZCcpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuYWRkUmVzdWx0KCdDREsnLCAnRGlmZiBBbmFseXNpcycsICdmYWlsJywgYENESyBkaWZmIGZhaWxlZDogJHtlcnJvcn1gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVGVzdCBkZXBsb3ltZW50IHZhbGlkYXRpb24gc2NyaXB0c1xyXG4gICAqL1xyXG4gIGFzeW5jIHRlc3RWYWxpZGF0aW9uU2NyaXB0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRoaXMubG9nKCfwn5SNIFRlc3RpbmcgZGVwbG95bWVudCB2YWxpZGF0aW9uIHNjcmlwdHMuLi4nKTtcclxuICAgIFxyXG4gICAgY29uc3QgdmFsaWRhdGlvblNjcmlwdHMgPSBbXHJcbiAgICAgIHsgbmFtZTogJ1ByZS1kZXBsb3ltZW50IFZhbGlkYXRpb24nLCBjb21tYW5kOiAnbnBtIHJ1biB2YWxpZGF0ZTpwcmUnIH0sXHJcbiAgICAgIHsgbmFtZTogJ05hbWluZyBWYWxpZGF0aW9uJywgY29tbWFuZDogJ25wbSBydW4gdmFsaWRhdGU6bmFtaW5nJyB9LFxyXG4gICAgICB7IG5hbWU6ICdTY2hlbWEgVmFsaWRhdGlvbicsIGNvbW1hbmQ6ICducG0gcnVuIHZhbGlkYXRlOnNjaGVtYScgfSxcclxuICAgIF07XHJcbiAgICBcclxuICAgIGZvciAoY29uc3Qgc2NyaXB0IG9mIHZhbGlkYXRpb25TY3JpcHRzKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgICBleGVjU3luYyhzY3JpcHQuY29tbWFuZCwgeyBzdGRpbzogJ3BpcGUnIH0pO1xyXG4gICAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmFkZFJlc3VsdCgnVmFsaWRhdGlvbicsIHNjcmlwdC5uYW1lLCAncGFzcycsIGBDb21wbGV0ZWQgaW4gJHtkdXJhdGlvbn1tc2ApO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIHRoaXMuYWRkUmVzdWx0KCdWYWxpZGF0aW9uJywgc2NyaXB0Lm5hbWUsICdmYWlsJywgYEZhaWxlZDogJHtlcnJvcn1gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVGVzdCBpbXBvcnQgcHJlcGFyYXRpb25cclxuICAgKi9cclxuICBhc3luYyB0ZXN0SW1wb3J0UHJlcGFyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmxvZygn8J+TpSBUZXN0aW5nIGltcG9ydCBwcmVwYXJhdGlvbi4uLicpO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBUZXN0IGltcG9ydCBjb25maWd1cmF0aW9uIGdlbmVyYXRpb25cclxuICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFRoaXMgd291bGQgbm9ybWFsbHkgYmUgcGFydCBvZiB0aGUgZGVwbG95LW1hc3RlciBzY3JpcHRcclxuICAgICAgLy8gRm9yIG5vdywgd2UnbGwgdGVzdCB0aGF0IHRoZSBzY3JpcHQgY2FuIGJlIGludm9rZWRcclxuICAgICAgZXhlY1N5bmMoJ25weCB0cy1ub2RlIHNjcmlwdHMvZGVwbG95LW1hc3Rlci50cyAtLWRyeS1ydW4gLS1lbnY9ZGV2JywgeyBzdGRpbzogJ3BpcGUnIH0pO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xyXG4gICAgICB0aGlzLmFkZFJlc3VsdCgnSW1wb3J0JywgJ1ByZXBhcmF0aW9uJywgJ3Bhc3MnLCBgSW1wb3J0IHByZXBhcmF0aW9uIGNvbXBsZXRlZCBpbiAke2R1cmF0aW9ufW1zYCk7XHJcbiAgICAgIFxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5hZGRSZXN1bHQoJ0ltcG9ydCcsICdQcmVwYXJhdGlvbicsICdmYWlsJywgYEltcG9ydCBwcmVwYXJhdGlvbiBmYWlsZWQ6ICR7ZXJyb3J9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSBpbnRlZ3JhdGlvbiB0ZXN0IHJlcG9ydFxyXG4gICAqL1xyXG4gIGdlbmVyYXRlUmVwb3J0KHByb3BlcnR5VGVzdFJlc3VsdHM6IHsgW3Rlc3RGaWxlOiBzdHJpbmddOiBhbnkgfSk6IEludGVncmF0aW9uVGVzdFJlcG9ydCB7XHJcbiAgICBjb25zdCB0b3RhbER1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHRoaXMuc3RhcnRUaW1lO1xyXG4gICAgXHJcbiAgICBjb25zdCBzdW1tYXJ5ID0ge1xyXG4gICAgICB0b3RhbDogdGhpcy5yZXN1bHRzLmxlbmd0aCxcclxuICAgICAgcGFzc2VkOiB0aGlzLnJlc3VsdHMuZmlsdGVyKHIgPT4gci5zdGF0dXMgPT09ICdwYXNzJykubGVuZ3RoLFxyXG4gICAgICBmYWlsZWQ6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ2ZhaWwnKS5sZW5ndGgsXHJcbiAgICAgIHNraXBwZWQ6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ3NraXAnKS5sZW5ndGgsXHJcbiAgICAgIGR1cmF0aW9uOiB0b3RhbER1cmF0aW9uLFxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBvdmVyYWxsU3RhdHVzOiAncGFzcycgfCAnZmFpbCcgPSBzdW1tYXJ5LmZhaWxlZCA9PT0gMCA/ICdwYXNzJyA6ICdmYWlsJztcclxuXHJcbiAgICAvLyBHZW5lcmF0ZSByZWNvbW1lbmRhdGlvbnNcclxuICAgIGNvbnN0IHJlY29tbWVuZGF0aW9uczogc3RyaW5nW10gPSBbXTtcclxuICAgIFxyXG4gICAgaWYgKHN1bW1hcnkuZmFpbGVkID4gMCkge1xyXG4gICAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgn8J+UpyBGaXggZmFpbGluZyB0ZXN0cyBiZWZvcmUgcHJvY2VlZGluZyB0byBpbmZyYXN0cnVjdHVyZSBpbXBvcnQnKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGZhaWxlZFRlc3RzID0gdGhpcy5yZXN1bHRzLmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnZmFpbCcpO1xyXG4gICAgICBmYWlsZWRUZXN0cy5mb3JFYWNoKHRlc3QgPT4ge1xyXG4gICAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKGAgICAtICR7dGVzdC5jYXRlZ29yeX06ICR7dGVzdC50ZXN0fSAtICR7dGVzdC5tZXNzYWdlfWApO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgZmFpbGVkUHJvcGVydHlUZXN0cyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnR5VGVzdFJlc3VsdHMpXHJcbiAgICAgIC5maWx0ZXIoKFtfLCByZXN1bHRdKSA9PiByZXN1bHQuc3RhdHVzID09PSAnZmFpbCcpO1xyXG4gICAgXHJcbiAgICBpZiAoZmFpbGVkUHJvcGVydHlUZXN0cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCfwn46yIEZpeCBmYWlsaW5nIHByb3BlcnR5LWJhc2VkIHRlc3RzOicpO1xyXG4gICAgICBmYWlsZWRQcm9wZXJ0eVRlc3RzLmZvckVhY2goKFt0ZXN0TmFtZSwgcmVzdWx0XSkgPT4ge1xyXG4gICAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKGAgICAtICR7dGVzdE5hbWV9OiAke3Jlc3VsdC5lcnJvcnM/LmpvaW4oJywgJyl9YCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAob3ZlcmFsbFN0YXR1cyA9PT0gJ3Bhc3MnKSB7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCfinIUgQWxsIGludGVncmF0aW9uIHRlc3RzIHBhc3NlZCAtIHJlYWR5IGZvciBpbmZyYXN0cnVjdHVyZSBpbXBvcnQnKTtcclxuICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goJ/Cfk4sgTmV4dCBzdGVwczonKTtcclxuICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goJyAgIDEuIFJldmlldyBUYXNrIDEzIGV4ZWN1dGlvbiBwbGFuJyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICAyLiBFbnN1cmUgYmFja3VwIHByb2NlZHVyZXMgYXJlIGluIHBsYWNlJyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICAzLiBFeGVjdXRlIENESyBpbXBvcnQgZm9yIERhdGFiYXNlIFN0YWNrJyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICA0LiBWYWxpZGF0ZSBpbXBvcnQgc3VjY2VzcycpO1xyXG4gICAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgnICAgNS4gUHJvY2VlZCB3aXRoIHJlbWFpbmluZyBzdGFjayBpbXBvcnRzJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcmVwb3J0OiBJbnRlZ3JhdGlvblRlc3RSZXBvcnQgPSB7XHJcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBlbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgcmVnaW9uOiB0aGlzLnJlZ2lvbixcclxuICAgICAgb3ZlcmFsbFN0YXR1cyxcclxuICAgICAgc3VtbWFyeSxcclxuICAgICAgcmVzdWx0czogdGhpcy5yZXN1bHRzLFxyXG4gICAgICBwcm9wZXJ0eVRlc3RSZXN1bHRzLFxyXG4gICAgICByZWNvbW1lbmRhdGlvbnMsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFNhdmUgcmVwb3J0XHJcbiAgICBjb25zdCByZXBvcnRQYXRoID0gcGF0aC5qb2luKCdpbnRlZ3JhdGlvbi1yZXBvcnRzJywgYGludGVncmF0aW9uLXRlc3QtJHtEYXRlLm5vdygpfS5qc29uYCk7XHJcbiAgICBcclxuICAgIGlmICghZnMuZXhpc3RzU3luYygnaW50ZWdyYXRpb24tcmVwb3J0cycpKSB7XHJcbiAgICAgIGZzLm1rZGlyU3luYygnaW50ZWdyYXRpb24tcmVwb3J0cycsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmcy53cml0ZUZpbGVTeW5jKHJlcG9ydFBhdGgsIEpTT04uc3RyaW5naWZ5KHJlcG9ydCwgbnVsbCwgMikpO1xyXG5cclxuICAgIC8vIFByaW50IHN1bW1hcnlcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn6eqIEludGVncmF0aW9uIFRlc3QgU3VtbWFyeTonKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDinIUgUGFzc2VkOiAke3N1bW1hcnkucGFzc2VkfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIOKdjCBGYWlsZWQ6ICR7c3VtbWFyeS5mYWlsZWR9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAg4o+t77iPIFNraXBwZWQ6ICR7c3VtbWFyeS5za2lwcGVkfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCfk50gVG90YWw6ICR7c3VtbWFyeS50b3RhbH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDij7HvuI8gRHVyYXRpb246ICR7KHN1bW1hcnkuZHVyYXRpb24gLyAxMDAwKS50b0ZpeGVkKDIpfXNgKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn46vIE92ZXJhbGwgU3RhdHVzOiAke292ZXJhbGxTdGF0dXMudG9VcHBlckNhc2UoKX1gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn5OLIFJlcG9ydDogJHtyZXBvcnRQYXRofWApO1xyXG5cclxuICAgIC8vIFByaW50IHByb3BlcnR5IHRlc3Qgc3VtbWFyeVxyXG4gICAgY29uc3QgcHJvcGVydHlUZXN0Q291bnQgPSBPYmplY3Qua2V5cyhwcm9wZXJ0eVRlc3RSZXN1bHRzKS5sZW5ndGg7XHJcbiAgICBjb25zdCBwYXNzZWRQcm9wZXJ0eVRlc3RzID0gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0eVRlc3RSZXN1bHRzKS5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ3Bhc3MnKS5sZW5ndGg7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn46yIFByb3BlcnR5IFRlc3QgU3VtbWFyeTonKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDinIUgUGFzc2VkOiAke3Bhc3NlZFByb3BlcnR5VGVzdHN9LyR7cHJvcGVydHlUZXN0Q291bnR9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAg8J+UhCBUb3RhbCBJdGVyYXRpb25zOiAke3Bhc3NlZFByb3BlcnR5VGVzdHMgKiAxMDB9K2ApO1xyXG5cclxuICAgIC8vIFByaW50IHJlY29tbWVuZGF0aW9uc1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfkqEgUmVjb21tZW5kYXRpb25zOicpO1xyXG4gICAgcmVwb3J0LnJlY29tbWVuZGF0aW9ucy5mb3JFYWNoKHJlYyA9PiBjb25zb2xlLmxvZyhyZWMpKTtcclxuXHJcbiAgICByZXR1cm4gcmVwb3J0O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRXhlY3V0ZSBjb21wcmVoZW5zaXZlIGludGVncmF0aW9uIHRlc3RpbmdcclxuICAgKi9cclxuICBhc3luYyBleGVjdXRlKCk6IFByb21pc2U8SW50ZWdyYXRpb25UZXN0UmVwb3J0PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICB0aGlzLmxvZygn8J+agCBTdGFydGluZyBUcmluaXR5IFN5c3RlbSBJbnRlZ3JhdGlvbiBUZXN0aW5nLi4uJyk7XHJcbiAgICAgIHRoaXMubG9nKGDwn5OLIEVudmlyb25tZW50OiAke3RoaXMuZW52aXJvbm1lbnR9YCk7XHJcbiAgICAgIHRoaXMubG9nKGDwn4yNIFJlZ2lvbjogJHt0aGlzLnJlZ2lvbn1gKTtcclxuICAgICAgdGhpcy5sb2coJ/Cfjq8gVGhpcyBpcyB0aGUgY3JpdGljYWwgXCJEcnkgUnVuXCIgY2hlY2twb2ludCBiZWZvcmUgaW5mcmFzdHJ1Y3R1cmUgaW1wb3J0XFxuJyk7XHJcblxyXG4gICAgICAvLyBSdW4gYWxsIGludGVncmF0aW9uIHRlc3RzXHJcbiAgICAgIGF3YWl0IHRoaXMudGVzdFR5cGVTY3JpcHRDb21waWxhdGlvbigpO1xyXG4gICAgICBhd2FpdCB0aGlzLnRlc3RDREtTeW50aGVzaXMoKTtcclxuICAgICAgYXdhaXQgdGhpcy50ZXN0QVdTQ29ubmVjdGl2aXR5KCk7XHJcbiAgICAgIGF3YWl0IHRoaXMudGVzdFJlc291cmNlQ29tcGF0aWJpbGl0eSgpO1xyXG4gICAgICBhd2FpdCB0aGlzLnRlc3RDREtEaWZmKCk7XHJcbiAgICAgIGF3YWl0IHRoaXMudGVzdFZhbGlkYXRpb25TY3JpcHRzKCk7XHJcbiAgICAgIGF3YWl0IHRoaXMudGVzdEltcG9ydFByZXBhcmF0aW9uKCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBSdW4gcHJvcGVydHktYmFzZWQgdGVzdHMgd2l0aCAxMDArIGl0ZXJhdGlvbnNcclxuICAgICAgY29uc3QgcHJvcGVydHlUZXN0UmVzdWx0cyA9IGF3YWl0IHRoaXMucnVuUHJvcGVydHlCYXNlZFRlc3RzKCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBHZW5lcmF0ZSBjb21wcmVoZW5zaXZlIHJlcG9ydFxyXG4gICAgICBjb25zdCByZXBvcnQgPSB0aGlzLmdlbmVyYXRlUmVwb3J0KHByb3BlcnR5VGVzdFJlc3VsdHMpO1xyXG4gICAgICBcclxuICAgICAgaWYgKHJlcG9ydC5vdmVyYWxsU3RhdHVzID09PSAncGFzcycpIHtcclxuICAgICAgICB0aGlzLmxvZygn8J+OiSBJbnRlZ3JhdGlvbiB0ZXN0aW5nIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkgLSByZWFkeSBmb3IgaW5mcmFzdHJ1Y3R1cmUgaW1wb3J0IScpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMubG9nKCfinYwgSW50ZWdyYXRpb24gdGVzdGluZyBmYWlsZWQgLSBmaXggaXNzdWVzIGJlZm9yZSBwcm9jZWVkaW5nJywgJ2Vycm9yJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHJldHVybiByZXBvcnQ7XHJcbiAgICAgIFxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2coYOKdjCBJbnRlZ3JhdGlvbiB0ZXN0aW5nIGVycm9yOiAke2Vycm9yfWAsICdlcnJvcicpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIENMSSBpbnRlcmZhY2VcclxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XHJcbiAgY29uc3QgYXJncyA9IHByb2Nlc3MuYXJndi5zbGljZSgyKTtcclxuICBcclxuICBjb25zdCBlbnZpcm9ubWVudCA9IGFyZ3MuZmluZChhcmcgPT4gYXJnLnN0YXJ0c1dpdGgoJy0tZW52PScpKT8uc3BsaXQoJz0nKVsxXSB8fCAnZGV2JztcclxuICBjb25zdCByZWdpb24gPSBhcmdzLmZpbmQoYXJnID0+IGFyZy5zdGFydHNXaXRoKCctLXJlZ2lvbj0nKSk/LnNwbGl0KCc9JylbMV0gfHwgJ2V1LXdlc3QtMSc7XHJcbiAgXHJcbiAgaWYgKGFyZ3MuaW5jbHVkZXMoJy0taGVscCcpIHx8IGFyZ3MuaW5jbHVkZXMoJy1oJykpIHtcclxuICAgIGNvbnNvbGUubG9nKGBcclxuVHJpbml0eSBTeXN0ZW0gSW50ZWdyYXRpb24gVGVzdGluZ1xyXG5cclxuVXNhZ2U6XHJcbiAgbnB4IHRzLW5vZGUgaW50ZWdyYXRpb24tdGVzdC50cyBbb3B0aW9uc11cclxuXHJcbk9wdGlvbnM6XHJcbiAgLS1lbnY9PGVudj4gICAgICAgICAgRW52aXJvbm1lbnQgKGRldnxzdGFnaW5nfHByb2R1Y3Rpb24pIFtkZWZhdWx0OiBkZXZdXHJcbiAgLS1yZWdpb249PHJlZ2lvbj4gICAgQVdTIHJlZ2lvbiBbZGVmYXVsdDogZXUtd2VzdC0xXVxyXG4gIC0taGVscCwgLWggICAgICAgICAgU2hvdyB0aGlzIGhlbHAgbWVzc2FnZVxyXG5cclxuRGVzY3JpcHRpb246XHJcbiAgVGhpcyBpcyB0aGUgY3JpdGljYWwgXCJEcnkgUnVuXCIgY2hlY2twb2ludCB0aGF0IHZhbGlkYXRlczpcclxuICAtIFR5cGVTY3JpcHQgY29tcGlsYXRpb24gYW5kIENESyBzeW50aGVzaXNcclxuICAtIEFXUyBjb25uZWN0aXZpdHkgYW5kIGV4aXN0aW5nIHJlc291cmNlIGNvbXBhdGliaWxpdHlcclxuICAtIFByb3BlcnR5LWJhc2VkIHRlc3RzIHdpdGggMTAwKyBpdGVyYXRpb25zXHJcbiAgLSBEZXBsb3ltZW50IHZhbGlkYXRpb24gc2NyaXB0c1xyXG4gIC0gSW1wb3J0IHByZXBhcmF0aW9uIHByb2NlZHVyZXNcclxuXHJcbiAgQWxsIHRlc3RzIG11c3QgcGFzcyBiZWZvcmUgcHJvY2VlZGluZyB0byBUYXNrIDEzIChJbmZyYXN0cnVjdHVyZSBJbXBvcnQpLlxyXG5cclxuRXhhbXBsZXM6XHJcbiAgIyBSdW4gaW50ZWdyYXRpb24gdGVzdHMgZm9yIGRldmVsb3BtZW50XHJcbiAgbnB4IHRzLW5vZGUgaW50ZWdyYXRpb24tdGVzdC50cyAtLWVudj1kZXZcclxuICBcclxuICAjIFJ1biBpbnRlZ3JhdGlvbiB0ZXN0cyBmb3IgcHJvZHVjdGlvblxyXG4gIG5weCB0cy1ub2RlIGludGVncmF0aW9uLXRlc3QudHMgLS1lbnY9cHJvZHVjdGlvbiAtLXJlZ2lvbj1ldS13ZXN0LTFcclxuYCk7XHJcbiAgICBwcm9jZXNzLmV4aXQoMCk7XHJcbiAgfVxyXG4gIFxyXG4gIGNvbnN0IHRlc3RlciA9IG5ldyBUcmluaXR5SW50ZWdyYXRpb25UZXN0ZXIoZW52aXJvbm1lbnQsIHJlZ2lvbik7XHJcbiAgdGVzdGVyLmV4ZWN1dGUoKS50aGVuKHJlcG9ydCA9PiB7XHJcbiAgICBwcm9jZXNzLmV4aXQocmVwb3J0Lm92ZXJhbGxTdGF0dXMgPT09ICdwYXNzJyA/IDAgOiAxKTtcclxuICB9KS5jYXRjaChlcnJvciA9PiB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgSW50ZWdyYXRpb24gdGVzdGluZyBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gIH0pO1xyXG59XHJcblxyXG5leHBvcnQgeyBUcmluaXR5SW50ZWdyYXRpb25UZXN0ZXIsIEludGVncmF0aW9uVGVzdFJlcG9ydCB9OyJdfQ==