#!/usr/bin/env npx ts-node
"use strict";
/**
 * Trinity Resource Naming Validation Script
 *
 * Validates that all resources follow Trinity naming conventions
 * and provides recommendations for fixes
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
exports.TrinityNamingValidator = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const resource_naming_1 = require("../config/resource-naming");
class TrinityNamingValidator {
    constructor(environment, region = 'eu-west-1') {
        this.results = [];
        this.config = {
            project: 'trinity',
            environment,
            region,
            version: 'v2'
        };
        this.cfClient = new client_cloudformation_1.CloudFormationClient({ region });
        this.dynamoClient = new client_dynamodb_1.DynamoDBClient({ region });
        this.lambdaClient = new client_lambda_1.LambdaClient({ region });
    }
    addResult(category, resource, current, expected, status, issues) {
        this.results.push({
            category,
            resource,
            current,
            expected,
            status,
            issues
        });
        const icon = status === 'compliant' ? '✅' : status === 'non-compliant' ? '❌' : '⚠️';
        console.log(`${icon} [${category}] ${resource}: ${current}`);
        if (issues.length > 0) {
            issues.forEach(issue => console.log(`   - ${issue}`));
        }
        if (expected && expected !== current) {
            console.log(`   Expected: ${expected}`);
        }
    }
    /**
     * Validate DynamoDB table names
     */
    async validateDynamoDBTables() {
        console.log('🗄️ Validating DynamoDB table names...\n');
        try {
            const tablesResponse = await this.dynamoClient.send(new client_dynamodb_1.ListTablesCommand({}));
            const existingTables = tablesResponse.TableNames || [];
            const expectedNames = (0, resource_naming_1.getExpectedResourceNames)();
            // Check existing Trinity tables
            const trinityTables = existingTables.filter(table => table.startsWith('trinity-'));
            for (const tableName of trinityTables) {
                const validation = (0, resource_naming_1.validateResourceName)(tableName, 'dynamodb-table', this.config);
                // Find expected name
                const expectedTable = Object.entries(expectedNames.tables).find(([_, name]) => name === tableName);
                const expectedName = expectedTable ? expectedTable[1] : undefined;
                if (validation.valid) {
                    this.addResult('DynamoDB', tableName, tableName, expectedName, 'compliant', []);
                }
                else {
                    this.addResult('DynamoDB', tableName, tableName, expectedName, 'non-compliant', validation.issues);
                }
            }
            // Check for missing expected tables
            for (const [tableKey, expectedName] of Object.entries(expectedNames.tables)) {
                if (!trinityTables.includes(expectedName)) {
                    this.addResult('DynamoDB', tableKey, 'NOT_FOUND', expectedName, 'warning', ['Expected table not found']);
                }
            }
        }
        catch (error) {
            console.error(`❌ Failed to validate DynamoDB tables: ${error}`);
        }
    }
    /**
     * Validate Lambda function names
     */
    async validateLambdaFunctions() {
        console.log('\n⚡ Validating Lambda function names...\n');
        try {
            const functionsResponse = await this.lambdaClient.send(new client_lambda_1.ListFunctionsCommand({}));
            const existingFunctions = functionsResponse.Functions?.map(f => f.FunctionName).filter(Boolean) || [];
            const expectedNames = (0, resource_naming_1.getExpectedResourceNames)();
            // Check existing Trinity functions
            const trinityFunctions = existingFunctions.filter((func) => func !== undefined && func.startsWith('trinity-'));
            for (const functionName of trinityFunctions) {
                const validation = (0, resource_naming_1.validateResourceName)(functionName, 'lambda-function', this.config);
                // Find expected name
                const expectedFunction = Object.entries(expectedNames.lambdas).find(([_, name]) => name === functionName);
                const expectedName = expectedFunction ? expectedFunction[1] : undefined;
                if (validation.valid) {
                    this.addResult('Lambda', functionName, functionName, expectedName, 'compliant', []);
                }
                else {
                    this.addResult('Lambda', functionName, functionName, expectedName, 'non-compliant', validation.issues);
                }
            }
            // Check for missing expected functions
            for (const [functionKey, expectedName] of Object.entries(expectedNames.lambdas)) {
                if (!trinityFunctions.includes(expectedName)) {
                    this.addResult('Lambda', functionKey, 'NOT_FOUND', expectedName, 'warning', ['Expected function not found']);
                }
            }
        }
        catch (error) {
            console.error(`❌ Failed to validate Lambda functions: ${error}`);
        }
    }
    /**
     * Validate CloudFormation stack names
     */
    async validateCloudFormationStacks() {
        console.log('\n📦 Validating CloudFormation stack names...\n');
        try {
            const stacksResponse = await this.cfClient.send(new client_cloudformation_1.ListStacksCommand({
                StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE']
            }));
            const existingStacks = stacksResponse.StackSummaries?.map(s => s.StackName).filter(Boolean) || [];
            const expectedNames = (0, resource_naming_1.getExpectedResourceNames)();
            // Check existing Trinity stacks
            const trinityStacks = existingStacks.filter((stack) => stack !== undefined && stack.includes('Trinity'));
            for (const stackName of trinityStacks) {
                const validation = (0, resource_naming_1.validateResourceName)(stackName, 'cloudformation-stack', this.config);
                // Find expected name
                const expectedStack = Object.entries(expectedNames.stacks).find(([_, name]) => name === stackName);
                const expectedName = expectedStack ? expectedStack[1] : undefined;
                if (validation.valid) {
                    this.addResult('CloudFormation', stackName, stackName, expectedName, 'compliant', []);
                }
                else {
                    this.addResult('CloudFormation', stackName, stackName, expectedName, 'non-compliant', validation.issues);
                }
            }
            // Check for missing expected stacks
            for (const [stackKey, expectedName] of Object.entries(expectedNames.stacks)) {
                if (!trinityStacks.includes(expectedName)) {
                    this.addResult('CloudFormation', stackKey, 'NOT_FOUND', expectedName, 'warning', ['Expected stack not found']);
                }
            }
        }
        catch (error) {
            console.error(`❌ Failed to validate CloudFormation stacks: ${error}`);
        }
    }
    /**
     * Validate CDK construct names in source code
     */
    validateCDKConstructNames() {
        console.log('\n🏗️ Validating CDK construct names in source code...\n');
        const libDir = path.join(__dirname, '..', 'lib');
        if (!fs.existsSync(libDir)) {
            console.log('⚠️ CDK lib directory not found');
            return;
        }
        const stackFiles = fs.readdirSync(libDir).filter(file => file.endsWith('.ts'));
        for (const file of stackFiles) {
            const filePath = path.join(libDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            // Check for hardcoded resource names
            const hardcodedNames = content.match(/tableName:\s*['"`]([^'"`]+)['"`]/g);
            if (hardcodedNames) {
                for (const match of hardcodedNames) {
                    const tableName = match.match(/['"`]([^'"`]+)['"`]/)?.[1];
                    if (tableName && tableName.startsWith('trinity-')) {
                        const validation = (0, resource_naming_1.validateResourceName)(tableName, 'dynamodb-table', this.config);
                        if (validation.valid) {
                            this.addResult('CDK Source', file, tableName, undefined, 'compliant', []);
                        }
                        else {
                            this.addResult('CDK Source', file, tableName, undefined, 'non-compliant', validation.issues);
                        }
                    }
                }
            }
        }
    }
    /**
     * Generate naming recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        const nonCompliantResults = this.results.filter(r => r.status === 'non-compliant');
        const warningResults = this.results.filter(r => r.status === 'warning');
        if (nonCompliantResults.length > 0) {
            recommendations.push('🔧 Fix non-compliant resource names:');
            nonCompliantResults.forEach(result => {
                if (result.expected) {
                    recommendations.push(`   - Rename ${result.current} to ${result.expected}`);
                }
                else {
                    recommendations.push(`   - Fix naming issues in ${result.current}: ${result.issues.join(', ')}`);
                }
            });
        }
        if (warningResults.length > 0) {
            recommendations.push('⚠️ Address missing resources:');
            warningResults.forEach(result => {
                if (result.expected) {
                    recommendations.push(`   - Create missing resource: ${result.expected}`);
                }
            });
        }
        if (nonCompliantResults.length === 0 && warningResults.length === 0) {
            recommendations.push('✅ All resource names are compliant with Trinity naming conventions');
        }
        recommendations.push('');
        recommendations.push('📋 Naming Convention Rules:');
        Object.entries(resource_naming_1.NAMING_RULES).forEach(([category, rules]) => {
            recommendations.push(`   ${category.toUpperCase()}:`);
            rules.forEach(rule => {
                recommendations.push(`     - ${rule}`);
            });
        });
        return recommendations;
    }
    /**
     * Generate naming validation report
     */
    generateReport() {
        const summary = {
            total: this.results.length,
            compliant: this.results.filter(r => r.status === 'compliant').length,
            nonCompliant: this.results.filter(r => r.status === 'non-compliant').length,
            warnings: this.results.filter(r => r.status === 'warning').length,
        };
        const report = {
            timestamp: new Date().toISOString(),
            environment: this.config.environment,
            region: this.config.region,
            summary,
            results: this.results,
            recommendations: this.generateRecommendations(),
        };
        // Save report
        const reportPath = path.join('naming-reports', `naming-validation-${Date.now()}.json`);
        if (!fs.existsSync('naming-reports')) {
            fs.mkdirSync('naming-reports', { recursive: true });
        }
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        // Print summary
        console.log('\n📊 Naming Validation Summary:');
        console.log(`   ✅ Compliant: ${summary.compliant}`);
        console.log(`   ❌ Non-compliant: ${summary.nonCompliant}`);
        console.log(`   ⚠️ Warnings: ${summary.warnings}`);
        console.log(`   📝 Total: ${summary.total}`);
        console.log(`   📋 Report: ${reportPath}`);
        // Print recommendations
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach(rec => console.log(rec));
        return report;
    }
    /**
     * Execute naming validation
     */
    async executeValidation() {
        console.log('🔍 Starting Trinity resource naming validation...\n');
        console.log(`📋 Environment: ${this.config.environment}`);
        console.log(`🌍 Region: ${this.config.region}\n`);
        // Validate different resource types
        await this.validateDynamoDBTables();
        await this.validateLambdaFunctions();
        await this.validateCloudFormationStacks();
        this.validateCDKConstructNames();
        return this.generateReport();
    }
}
exports.TrinityNamingValidator = TrinityNamingValidator;
// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
    const region = args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1';
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Trinity Resource Naming Validation

Usage:
  npx ts-node validate-naming.ts [options]

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --help, -h          Show this help message

Examples:
  # Validate naming in development
  npx ts-node validate-naming.ts --env=dev
  
  # Validate naming in production
  npx ts-node validate-naming.ts --env=production --region=eu-west-1
`);
        process.exit(0);
    }
    const validator = new TrinityNamingValidator(environment, region);
    validator.executeValidation().then(report => {
        const hasIssues = report.summary.nonCompliant > 0;
        process.exit(hasIssues ? 1 : 0);
    }).catch(error => {
        console.error('❌ Naming validation failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUtbmFtaW5nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmFsaWRhdGUtbmFtaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUE7Ozs7O0dBS0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsMEVBQXdIO0FBQ3hILDhEQUE2RTtBQUM3RSwwREFBNEU7QUFDNUUsK0RBTW1DO0FBeUJuQyxNQUFNLHNCQUFzQjtJQU8xQixZQUFZLFdBQW1CLEVBQUUsU0FBaUIsV0FBVztRQUZyRCxZQUFPLEdBQTZCLEVBQUUsQ0FBQztRQUc3QyxJQUFJLENBQUMsTUFBTSxHQUFHO1lBQ1osT0FBTyxFQUFFLFNBQVM7WUFDbEIsV0FBVztZQUNYLE1BQU07WUFDTixPQUFPLEVBQUUsSUFBSTtTQUNkLENBQUM7UUFFRixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksNENBQW9CLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksNEJBQVksQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVPLFNBQVMsQ0FDZixRQUFnQixFQUNoQixRQUFnQixFQUNoQixPQUFlLEVBQ2YsUUFBNEIsRUFDNUIsTUFBaUQsRUFDakQsTUFBZ0I7UUFFaEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7WUFDaEIsUUFBUTtZQUNSLFFBQVE7WUFDUixPQUFPO1lBQ1AsUUFBUTtZQUNSLE1BQU07WUFDTixNQUFNO1NBQ1AsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFJLEdBQUcsTUFBTSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUss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TCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbnB4IHRzLW5vZGVcclxuXHJcbi8qKlxyXG4gKiBUcmluaXR5IFJlc291cmNlIE5hbWluZyBWYWxpZGF0aW9uIFNjcmlwdFxyXG4gKiBcclxuICogVmFsaWRhdGVzIHRoYXQgYWxsIHJlc291cmNlcyBmb2xsb3cgVHJpbml0eSBuYW1pbmcgY29udmVudGlvbnNcclxuICogYW5kIHByb3ZpZGVzIHJlY29tbWVuZGF0aW9ucyBmb3IgZml4ZXNcclxuICovXHJcblxyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7IENsb3VkRm9ybWF0aW9uQ2xpZW50LCBMaXN0U3RhY2tzQ29tbWFuZCwgRGVzY3JpYmVTdGFja1Jlc291cmNlc0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtY2xvdWRmb3JtYXRpb24nO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCwgTGlzdFRhYmxlc0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBMYW1iZGFDbGllbnQsIExpc3RGdW5jdGlvbnNDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWxhbWJkYSc7XHJcbmltcG9ydCB7IFxyXG4gIGdlbmVyYXRlUmVzb3VyY2VOYW1lcywgXHJcbiAgdmFsaWRhdGVSZXNvdXJjZU5hbWUsIFxyXG4gIGdldEV4cGVjdGVkUmVzb3VyY2VOYW1lcyxcclxuICBOQU1JTkdfUlVMRVMsXHJcbiAgTmFtaW5nQ29uZmlnIFxyXG59IGZyb20gJy4uL2NvbmZpZy9yZXNvdXJjZS1uYW1pbmcnO1xyXG5cclxuaW50ZXJmYWNlIE5hbWluZ1ZhbGlkYXRpb25SZXN1bHQge1xyXG4gIGNhdGVnb3J5OiBzdHJpbmc7XHJcbiAgcmVzb3VyY2U6IHN0cmluZztcclxuICBjdXJyZW50OiBzdHJpbmc7XHJcbiAgZXhwZWN0ZWQ/OiBzdHJpbmc7XHJcbiAgc3RhdHVzOiAnY29tcGxpYW50JyB8ICdub24tY29tcGxpYW50JyB8ICd3YXJuaW5nJztcclxuICBpc3N1ZXM6IHN0cmluZ1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTmFtaW5nUmVwb3J0IHtcclxuICB0aW1lc3RhbXA6IHN0cmluZztcclxuICBlbnZpcm9ubWVudDogc3RyaW5nO1xyXG4gIHJlZ2lvbjogc3RyaW5nO1xyXG4gIHN1bW1hcnk6IHtcclxuICAgIHRvdGFsOiBudW1iZXI7XHJcbiAgICBjb21wbGlhbnQ6IG51bWJlcjtcclxuICAgIG5vbkNvbXBsaWFudDogbnVtYmVyO1xyXG4gICAgd2FybmluZ3M6IG51bWJlcjtcclxuICB9O1xyXG4gIHJlc3VsdHM6IE5hbWluZ1ZhbGlkYXRpb25SZXN1bHRbXTtcclxuICByZWNvbW1lbmRhdGlvbnM6IHN0cmluZ1tdO1xyXG59XHJcblxyXG5jbGFzcyBUcmluaXR5TmFtaW5nVmFsaWRhdG9yIHtcclxuICBwcml2YXRlIGNvbmZpZzogTmFtaW5nQ29uZmlnO1xyXG4gIHByaXZhdGUgY2ZDbGllbnQ6IENsb3VkRm9ybWF0aW9uQ2xpZW50O1xyXG4gIHByaXZhdGUgZHluYW1vQ2xpZW50OiBEeW5hbW9EQkNsaWVudDtcclxuICBwcml2YXRlIGxhbWJkYUNsaWVudDogTGFtYmRhQ2xpZW50O1xyXG4gIHByaXZhdGUgcmVzdWx0czogTmFtaW5nVmFsaWRhdGlvblJlc3VsdFtdID0gW107XHJcblxyXG4gIGNvbnN0cnVjdG9yKGVudmlyb25tZW50OiBzdHJpbmcsIHJlZ2lvbjogc3RyaW5nID0gJ2V1LXdlc3QtMScpIHtcclxuICAgIHRoaXMuY29uZmlnID0ge1xyXG4gICAgICBwcm9qZWN0OiAndHJpbml0eScsXHJcbiAgICAgIGVudmlyb25tZW50LFxyXG4gICAgICByZWdpb24sXHJcbiAgICAgIHZlcnNpb246ICd2MidcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2ZDbGllbnQgPSBuZXcgQ2xvdWRGb3JtYXRpb25DbGllbnQoeyByZWdpb24gfSk7XHJcbiAgICB0aGlzLmR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7IHJlZ2lvbiB9KTtcclxuICAgIHRoaXMubGFtYmRhQ2xpZW50ID0gbmV3IExhbWJkYUNsaWVudCh7IHJlZ2lvbiB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkUmVzdWx0KFxyXG4gICAgY2F0ZWdvcnk6IHN0cmluZywgXHJcbiAgICByZXNvdXJjZTogc3RyaW5nLCBcclxuICAgIGN1cnJlbnQ6IHN0cmluZywgXHJcbiAgICBleHBlY3RlZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBcclxuICAgIHN0YXR1czogJ2NvbXBsaWFudCcgfCAnbm9uLWNvbXBsaWFudCcgfCAnd2FybmluZycsIFxyXG4gICAgaXNzdWVzOiBzdHJpbmdbXVxyXG4gICkge1xyXG4gICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICBjYXRlZ29yeSxcclxuICAgICAgcmVzb3VyY2UsXHJcbiAgICAgIGN1cnJlbnQsXHJcbiAgICAgIGV4cGVjdGVkLFxyXG4gICAgICBzdGF0dXMsXHJcbiAgICAgIGlzc3Vlc1xyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgaWNvbiA9IHN0YXR1cyA9PT0gJ2NvbXBsaWFudCcgPyAn4pyFJyA6IHN0YXR1cyA9PT0gJ25vbi1jb21wbGlhbnQnID8gJ+KdjCcgOiAn4pqg77iPJztcclxuICAgIGNvbnNvbGUubG9nKGAke2ljb259IFske2NhdGVnb3J5fV0gJHtyZXNvdXJjZX06ICR7Y3VycmVudH1gKTtcclxuICAgIGlmIChpc3N1ZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBpc3N1ZXMuZm9yRWFjaChpc3N1ZSA9PiBjb25zb2xlLmxvZyhgICAgLSAke2lzc3VlfWApKTtcclxuICAgIH1cclxuICAgIGlmIChleHBlY3RlZCAmJiBleHBlY3RlZCAhPT0gY3VycmVudCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAgRXhwZWN0ZWQ6ICR7ZXhwZWN0ZWR9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBEeW5hbW9EQiB0YWJsZSBuYW1lc1xyXG4gICAqL1xyXG4gIGFzeW5jIHZhbGlkYXRlRHluYW1vREJUYWJsZXMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+XhO+4jyBWYWxpZGF0aW5nIER5bmFtb0RCIHRhYmxlIG5hbWVzLi4uXFxuJyk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdGFibGVzUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKG5ldyBMaXN0VGFibGVzQ29tbWFuZCh7fSkpO1xyXG4gICAgICBjb25zdCBleGlzdGluZ1RhYmxlcyA9IHRhYmxlc1Jlc3BvbnNlLlRhYmxlTmFtZXMgfHwgW107XHJcbiAgICAgIGNvbnN0IGV4cGVjdGVkTmFtZXMgPSBnZXRFeHBlY3RlZFJlc291cmNlTmFtZXMoKTtcclxuXHJcbiAgICAgIC8vIENoZWNrIGV4aXN0aW5nIFRyaW5pdHkgdGFibGVzXHJcbiAgICAgIGNvbnN0IHRyaW5pdHlUYWJsZXMgPSBleGlzdGluZ1RhYmxlcy5maWx0ZXIodGFibGUgPT4gdGFibGUuc3RhcnRzV2l0aCgndHJpbml0eS0nKSk7XHJcblxyXG4gICAgICBmb3IgKGNvbnN0IHRhYmxlTmFtZSBvZiB0cmluaXR5VGFibGVzKSB7XHJcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlUmVzb3VyY2VOYW1lKHRhYmxlTmFtZSwgJ2R5bmFtb2RiLXRhYmxlJywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgZXhwZWN0ZWQgbmFtZVxyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVGFibGUgPSBPYmplY3QuZW50cmllcyhleHBlY3RlZE5hbWVzLnRhYmxlcykuZmluZCgoW18sIG5hbWVdKSA9PiBuYW1lID09PSB0YWJsZU5hbWUpO1xyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkTmFtZSA9IGV4cGVjdGVkVGFibGUgPyBleHBlY3RlZFRhYmxlWzFdIDogdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICBpZiAodmFsaWRhdGlvbi52YWxpZCkge1xyXG4gICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0R5bmFtb0RCJywgdGFibGVOYW1lLCB0YWJsZU5hbWUsIGV4cGVjdGVkTmFtZSwgJ2NvbXBsaWFudCcsIFtdKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0R5bmFtb0RCJywgdGFibGVOYW1lLCB0YWJsZU5hbWUsIGV4cGVjdGVkTmFtZSwgJ25vbi1jb21wbGlhbnQnLCB2YWxpZGF0aW9uLmlzc3Vlcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBDaGVjayBmb3IgbWlzc2luZyBleHBlY3RlZCB0YWJsZXNcclxuICAgICAgZm9yIChjb25zdCBbdGFibGVLZXksIGV4cGVjdGVkTmFtZV0gb2YgT2JqZWN0LmVudHJpZXMoZXhwZWN0ZWROYW1lcy50YWJsZXMpKSB7XHJcbiAgICAgICAgaWYgKCF0cmluaXR5VGFibGVzLmluY2x1ZGVzKGV4cGVjdGVkTmFtZSkpIHtcclxuICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdEeW5hbW9EQicsIHRhYmxlS2V5LCAnTk9UX0ZPVU5EJywgZXhwZWN0ZWROYW1lLCAnd2FybmluZycsIFsnRXhwZWN0ZWQgdGFibGUgbm90IGZvdW5kJ10pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gdmFsaWRhdGUgRHluYW1vREIgdGFibGVzOiAke2Vycm9yfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgTGFtYmRhIGZ1bmN0aW9uIG5hbWVzXHJcbiAgICovXHJcbiAgYXN5bmMgdmFsaWRhdGVMYW1iZGFGdW5jdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu4pqhIFZhbGlkYXRpbmcgTGFtYmRhIGZ1bmN0aW9uIG5hbWVzLi4uXFxuJyk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgZnVuY3Rpb25zUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmxhbWJkYUNsaWVudC5zZW5kKG5ldyBMaXN0RnVuY3Rpb25zQ29tbWFuZCh7fSkpO1xyXG4gICAgICBjb25zdCBleGlzdGluZ0Z1bmN0aW9ucyA9IGZ1bmN0aW9uc1Jlc3BvbnNlLkZ1bmN0aW9ucz8ubWFwKGYgPT4gZi5GdW5jdGlvbk5hbWUpLmZpbHRlcihCb29sZWFuKSB8fCBbXTtcclxuICAgICAgY29uc3QgZXhwZWN0ZWROYW1lcyA9IGdldEV4cGVjdGVkUmVzb3VyY2VOYW1lcygpO1xyXG5cclxuICAgICAgLy8gQ2hlY2sgZXhpc3RpbmcgVHJpbml0eSBmdW5jdGlvbnNcclxuICAgICAgY29uc3QgdHJpbml0eUZ1bmN0aW9ucyA9IGV4aXN0aW5nRnVuY3Rpb25zLmZpbHRlcigoZnVuYyk6IGZ1bmMgaXMgc3RyaW5nID0+IFxyXG4gICAgICAgIGZ1bmMgIT09IHVuZGVmaW5lZCAmJiBmdW5jLnN0YXJ0c1dpdGgoJ3RyaW5pdHktJylcclxuICAgICAgKTtcclxuXHJcbiAgICAgIGZvciAoY29uc3QgZnVuY3Rpb25OYW1lIG9mIHRyaW5pdHlGdW5jdGlvbnMpIHtcclxuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVSZXNvdXJjZU5hbWUoZnVuY3Rpb25OYW1lLCAnbGFtYmRhLWZ1bmN0aW9uJywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgZXhwZWN0ZWQgbmFtZVxyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkRnVuY3Rpb24gPSBPYmplY3QuZW50cmllcyhleHBlY3RlZE5hbWVzLmxhbWJkYXMpLmZpbmQoKFtfLCBuYW1lXSkgPT4gbmFtZSA9PT0gZnVuY3Rpb25OYW1lKTtcclxuICAgICAgICBjb25zdCBleHBlY3RlZE5hbWUgPSBleHBlY3RlZEZ1bmN0aW9uID8gZXhwZWN0ZWRGdW5jdGlvblsxXSA6IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKHZhbGlkYXRpb24udmFsaWQpIHtcclxuICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdMYW1iZGEnLCBmdW5jdGlvbk5hbWUsIGZ1bmN0aW9uTmFtZSwgZXhwZWN0ZWROYW1lLCAnY29tcGxpYW50JywgW10pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnTGFtYmRhJywgZnVuY3Rpb25OYW1lLCBmdW5jdGlvbk5hbWUsIGV4cGVjdGVkTmFtZSwgJ25vbi1jb21wbGlhbnQnLCB2YWxpZGF0aW9uLmlzc3Vlcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBDaGVjayBmb3IgbWlzc2luZyBleHBlY3RlZCBmdW5jdGlvbnNcclxuICAgICAgZm9yIChjb25zdCBbZnVuY3Rpb25LZXksIGV4cGVjdGVkTmFtZV0gb2YgT2JqZWN0LmVudHJpZXMoZXhwZWN0ZWROYW1lcy5sYW1iZGFzKSkge1xyXG4gICAgICAgIGlmICghdHJpbml0eUZ1bmN0aW9ucy5pbmNsdWRlcyhleHBlY3RlZE5hbWUpKSB7XHJcbiAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnTGFtYmRhJywgZnVuY3Rpb25LZXksICdOT1RfRk9VTkQnLCBleHBlY3RlZE5hbWUsICd3YXJuaW5nJywgWydFeHBlY3RlZCBmdW5jdGlvbiBub3QgZm91bmQnXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byB2YWxpZGF0ZSBMYW1iZGEgZnVuY3Rpb25zOiAke2Vycm9yfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgQ2xvdWRGb3JtYXRpb24gc3RhY2sgbmFtZXNcclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZUNsb3VkRm9ybWF0aW9uU3RhY2tzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfk6YgVmFsaWRhdGluZyBDbG91ZEZvcm1hdGlvbiBzdGFjayBuYW1lcy4uLlxcbicpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHN0YWNrc1Jlc3BvbnNlID0gYXdhaXQgdGhpcy5jZkNsaWVudC5zZW5kKG5ldyBMaXN0U3RhY2tzQ29tbWFuZCh7XHJcbiAgICAgICAgU3RhY2tTdGF0dXNGaWx0ZXI6IFsnQ1JFQVRFX0NPTVBMRVRFJywgJ1VQREFURV9DT01QTEVURScsICdVUERBVEVfUk9MTEJBQ0tfQ09NUExFVEUnXVxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBleGlzdGluZ1N0YWNrcyA9IHN0YWNrc1Jlc3BvbnNlLlN0YWNrU3VtbWFyaWVzPy5tYXAocyA9PiBzLlN0YWNrTmFtZSkuZmlsdGVyKEJvb2xlYW4pIHx8IFtdO1xyXG4gICAgICBjb25zdCBleHBlY3RlZE5hbWVzID0gZ2V0RXhwZWN0ZWRSZXNvdXJjZU5hbWVzKCk7XHJcblxyXG4gICAgICAvLyBDaGVjayBleGlzdGluZyBUcmluaXR5IHN0YWNrc1xyXG4gICAgICBjb25zdCB0cmluaXR5U3RhY2tzID0gZXhpc3RpbmdTdGFja3MuZmlsdGVyKChzdGFjayk6IHN0YWNrIGlzIHN0cmluZyA9PiBcclxuICAgICAgICBzdGFjayAhPT0gdW5kZWZpbmVkICYmIHN0YWNrLmluY2x1ZGVzKCdUcmluaXR5JylcclxuICAgICAgKTtcclxuXHJcbiAgICAgIGZvciAoY29uc3Qgc3RhY2tOYW1lIG9mIHRyaW5pdHlTdGFja3MpIHtcclxuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVSZXNvdXJjZU5hbWUoc3RhY2tOYW1lLCAnY2xvdWRmb3JtYXRpb24tc3RhY2snLCB0aGlzLmNvbmZpZyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBleHBlY3RlZCBuYW1lXHJcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRTdGFjayA9IE9iamVjdC5lbnRyaWVzKGV4cGVjdGVkTmFtZXMuc3RhY2tzKS5maW5kKChbXywgbmFtZV0pID0+IG5hbWUgPT09IHN0YWNrTmFtZSk7XHJcbiAgICAgICAgY29uc3QgZXhwZWN0ZWROYW1lID0gZXhwZWN0ZWRTdGFjayA/IGV4cGVjdGVkU3RhY2tbMV0gOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICh2YWxpZGF0aW9uLnZhbGlkKSB7XHJcbiAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ2xvdWRGb3JtYXRpb24nLCBzdGFja05hbWUsIHN0YWNrTmFtZSwgZXhwZWN0ZWROYW1lLCAnY29tcGxpYW50JywgW10pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ2xvdWRGb3JtYXRpb24nLCBzdGFja05hbWUsIHN0YWNrTmFtZSwgZXhwZWN0ZWROYW1lLCAnbm9uLWNvbXBsaWFudCcsIHZhbGlkYXRpb24uaXNzdWVzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENoZWNrIGZvciBtaXNzaW5nIGV4cGVjdGVkIHN0YWNrc1xyXG4gICAgICBmb3IgKGNvbnN0IFtzdGFja0tleSwgZXhwZWN0ZWROYW1lXSBvZiBPYmplY3QuZW50cmllcyhleHBlY3RlZE5hbWVzLnN0YWNrcykpIHtcclxuICAgICAgICBpZiAoIXRyaW5pdHlTdGFja3MuaW5jbHVkZXMoZXhwZWN0ZWROYW1lKSkge1xyXG4gICAgICAgICAgdGhpcy5hZGRSZXN1bHQoJ0Nsb3VkRm9ybWF0aW9uJywgc3RhY2tLZXksICdOT1RfRk9VTkQnLCBleHBlY3RlZE5hbWUsICd3YXJuaW5nJywgWydFeHBlY3RlZCBzdGFjayBub3QgZm91bmQnXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byB2YWxpZGF0ZSBDbG91ZEZvcm1hdGlvbiBzdGFja3M6ICR7ZXJyb3J9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBDREsgY29uc3RydWN0IG5hbWVzIGluIHNvdXJjZSBjb2RlXHJcbiAgICovXHJcbiAgdmFsaWRhdGVDREtDb25zdHJ1Y3ROYW1lcygpOiB2b2lkIHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn4+X77iPIFZhbGlkYXRpbmcgQ0RLIGNvbnN0cnVjdCBuYW1lcyBpbiBzb3VyY2UgY29kZS4uLlxcbicpO1xyXG5cclxuICAgIGNvbnN0IGxpYkRpciA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLicsICdsaWInKTtcclxuICAgIGlmICghZnMuZXhpc3RzU3luYyhsaWJEaXIpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfimqDvuI8gQ0RLIGxpYiBkaXJlY3Rvcnkgbm90IGZvdW5kJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzdGFja0ZpbGVzID0gZnMucmVhZGRpclN5bmMobGliRGlyKS5maWx0ZXIoZmlsZSA9PiBmaWxlLmVuZHNXaXRoKCcudHMnKSk7XHJcblxyXG4gICAgZm9yIChjb25zdCBmaWxlIG9mIHN0YWNrRmlsZXMpIHtcclxuICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4obGliRGlyLCBmaWxlKTtcclxuICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0ZjgnKTtcclxuXHJcbiAgICAgIC8vIENoZWNrIGZvciBoYXJkY29kZWQgcmVzb3VyY2UgbmFtZXNcclxuICAgICAgY29uc3QgaGFyZGNvZGVkTmFtZXMgPSBjb250ZW50Lm1hdGNoKC90YWJsZU5hbWU6XFxzKlsnXCJgXShbXidcImBdKylbJ1wiYF0vZyk7XHJcbiAgICAgIGlmIChoYXJkY29kZWROYW1lcykge1xyXG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgaGFyZGNvZGVkTmFtZXMpIHtcclxuICAgICAgICAgIGNvbnN0IHRhYmxlTmFtZSA9IG1hdGNoLm1hdGNoKC9bJ1wiYF0oW14nXCJgXSspWydcImBdLyk/LlsxXTtcclxuICAgICAgICAgIGlmICh0YWJsZU5hbWUgJiYgdGFibGVOYW1lLnN0YXJ0c1dpdGgoJ3RyaW5pdHktJykpIHtcclxuICAgICAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlUmVzb3VyY2VOYW1lKHRhYmxlTmFtZSwgJ2R5bmFtb2RiLXRhYmxlJywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHZhbGlkYXRpb24udmFsaWQpIHtcclxuICAgICAgICAgICAgICB0aGlzLmFkZFJlc3VsdCgnQ0RLIFNvdXJjZScsIGZpbGUsIHRhYmxlTmFtZSwgdW5kZWZpbmVkLCAnY29tcGxpYW50JywgW10pO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIHRoaXMuYWRkUmVzdWx0KCdDREsgU291cmNlJywgZmlsZSwgdGFibGVOYW1lLCB1bmRlZmluZWQsICdub24tY29tcGxpYW50JywgdmFsaWRhdGlvbi5pc3N1ZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSBuYW1pbmcgcmVjb21tZW5kYXRpb25zXHJcbiAgICovXHJcbiAgZ2VuZXJhdGVSZWNvbW1lbmRhdGlvbnMoKTogc3RyaW5nW10ge1xyXG4gICAgY29uc3QgcmVjb21tZW5kYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgY29uc3Qgbm9uQ29tcGxpYW50UmVzdWx0cyA9IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ25vbi1jb21wbGlhbnQnKTtcclxuICAgIGNvbnN0IHdhcm5pbmdSZXN1bHRzID0gdGhpcy5yZXN1bHRzLmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnd2FybmluZycpO1xyXG5cclxuICAgIGlmIChub25Db21wbGlhbnRSZXN1bHRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goJ/CflKcgRml4IG5vbi1jb21wbGlhbnQgcmVzb3VyY2UgbmFtZXM6Jyk7XHJcbiAgICAgIG5vbkNvbXBsaWFudFJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xyXG4gICAgICAgIGlmIChyZXN1bHQuZXhwZWN0ZWQpIHtcclxuICAgICAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKGAgICAtIFJlbmFtZSAke3Jlc3VsdC5jdXJyZW50fSB0byAke3Jlc3VsdC5leHBlY3RlZH1gKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goYCAgIC0gRml4IG5hbWluZyBpc3N1ZXMgaW4gJHtyZXN1bHQuY3VycmVudH06ICR7cmVzdWx0Lmlzc3Vlcy5qb2luKCcsICcpfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHdhcm5pbmdSZXN1bHRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goJ+KaoO+4jyBBZGRyZXNzIG1pc3NpbmcgcmVzb3VyY2VzOicpO1xyXG4gICAgICB3YXJuaW5nUmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XHJcbiAgICAgICAgaWYgKHJlc3VsdC5leHBlY3RlZCkge1xyXG4gICAgICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goYCAgIC0gQ3JlYXRlIG1pc3NpbmcgcmVzb3VyY2U6ICR7cmVzdWx0LmV4cGVjdGVkfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG5vbkNvbXBsaWFudFJlc3VsdHMubGVuZ3RoID09PSAwICYmIHdhcm5pbmdSZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgn4pyFIEFsbCByZXNvdXJjZSBuYW1lcyBhcmUgY29tcGxpYW50IHdpdGggVHJpbml0eSBuYW1pbmcgY29udmVudGlvbnMnKTtcclxuICAgIH1cclxuXHJcbiAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgnJyk7XHJcbiAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgn8J+TiyBOYW1pbmcgQ29udmVudGlvbiBSdWxlczonKTtcclxuICAgIE9iamVjdC5lbnRyaWVzKE5BTUlOR19SVUxFUykuZm9yRWFjaCgoW2NhdGVnb3J5LCBydWxlc10pID0+IHtcclxuICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goYCAgICR7Y2F0ZWdvcnkudG9VcHBlckNhc2UoKX06YCk7XHJcbiAgICAgIHJ1bGVzLmZvckVhY2gocnVsZSA9PiB7XHJcbiAgICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goYCAgICAgLSAke3J1bGV9YCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlY29tbWVuZGF0aW9ucztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIG5hbWluZyB2YWxpZGF0aW9uIHJlcG9ydFxyXG4gICAqL1xyXG4gIGdlbmVyYXRlUmVwb3J0KCk6IE5hbWluZ1JlcG9ydCB7XHJcbiAgICBjb25zdCBzdW1tYXJ5ID0ge1xyXG4gICAgICB0b3RhbDogdGhpcy5yZXN1bHRzLmxlbmd0aCxcclxuICAgICAgY29tcGxpYW50OiB0aGlzLnJlc3VsdHMuZmlsdGVyKHIgPT4gci5zdGF0dXMgPT09ICdjb21wbGlhbnQnKS5sZW5ndGgsXHJcbiAgICAgIG5vbkNvbXBsaWFudDogdGhpcy5yZXN1bHRzLmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnbm9uLWNvbXBsaWFudCcpLmxlbmd0aCxcclxuICAgICAgd2FybmluZ3M6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ3dhcm5pbmcnKS5sZW5ndGgsXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IHJlcG9ydDogTmFtaW5nUmVwb3J0ID0ge1xyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHRoaXMuY29uZmlnLmVudmlyb25tZW50LFxyXG4gICAgICByZWdpb246IHRoaXMuY29uZmlnLnJlZ2lvbixcclxuICAgICAgc3VtbWFyeSxcclxuICAgICAgcmVzdWx0czogdGhpcy5yZXN1bHRzLFxyXG4gICAgICByZWNvbW1lbmRhdGlvbnM6IHRoaXMuZ2VuZXJhdGVSZWNvbW1lbmRhdGlvbnMoKSxcclxuICAgIH07XHJcblxyXG4gICAgLy8gU2F2ZSByZXBvcnRcclxuICAgIGNvbnN0IHJlcG9ydFBhdGggPSBwYXRoLmpvaW4oJ25hbWluZy1yZXBvcnRzJywgYG5hbWluZy12YWxpZGF0aW9uLSR7RGF0ZS5ub3coKX0uanNvbmApO1xyXG4gICAgXHJcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoJ25hbWluZy1yZXBvcnRzJykpIHtcclxuICAgICAgZnMubWtkaXJTeW5jKCduYW1pbmctcmVwb3J0cycsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmcy53cml0ZUZpbGVTeW5jKHJlcG9ydFBhdGgsIEpTT04uc3RyaW5naWZ5KHJlcG9ydCwgbnVsbCwgMikpO1xyXG5cclxuICAgIC8vIFByaW50IHN1bW1hcnlcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OKIE5hbWluZyBWYWxpZGF0aW9uIFN1bW1hcnk6Jyk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIENvbXBsaWFudDogJHtzdW1tYXJ5LmNvbXBsaWFudH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDinYwgTm9uLWNvbXBsaWFudDogJHtzdW1tYXJ5Lm5vbkNvbXBsaWFudH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDimqDvuI8gV2FybmluZ3M6ICR7c3VtbWFyeS53YXJuaW5nc31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn5OdIFRvdGFsOiAke3N1bW1hcnkudG90YWx9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAg8J+TiyBSZXBvcnQ6ICR7cmVwb3J0UGF0aH1gKTtcclxuXHJcbiAgICAvLyBQcmludCByZWNvbW1lbmRhdGlvbnNcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5KhIFJlY29tbWVuZGF0aW9uczonKTtcclxuICAgIHJlcG9ydC5yZWNvbW1lbmRhdGlvbnMuZm9yRWFjaChyZWMgPT4gY29uc29sZS5sb2cocmVjKSk7XHJcblxyXG4gICAgcmV0dXJuIHJlcG9ydDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEV4ZWN1dGUgbmFtaW5nIHZhbGlkYXRpb25cclxuICAgKi9cclxuICBhc3luYyBleGVjdXRlVmFsaWRhdGlvbigpOiBQcm9taXNlPE5hbWluZ1JlcG9ydD4ge1xyXG4gICAgY29uc29sZS5sb2coJ/CflI0gU3RhcnRpbmcgVHJpbml0eSByZXNvdXJjZSBuYW1pbmcgdmFsaWRhdGlvbi4uLlxcbicpO1xyXG4gICAgY29uc29sZS5sb2coYPCfk4sgRW52aXJvbm1lbnQ6ICR7dGhpcy5jb25maWcuZW52aXJvbm1lbnR9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+MjSBSZWdpb246ICR7dGhpcy5jb25maWcucmVnaW9ufVxcbmApO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIGRpZmZlcmVudCByZXNvdXJjZSB0eXBlc1xyXG4gICAgYXdhaXQgdGhpcy52YWxpZGF0ZUR5bmFtb0RCVGFibGVzKCk7XHJcbiAgICBhd2FpdCB0aGlzLnZhbGlkYXRlTGFtYmRhRnVuY3Rpb25zKCk7XHJcbiAgICBhd2FpdCB0aGlzLnZhbGlkYXRlQ2xvdWRGb3JtYXRpb25TdGFja3MoKTtcclxuICAgIHRoaXMudmFsaWRhdGVDREtDb25zdHJ1Y3ROYW1lcygpO1xyXG5cclxuICAgIHJldHVybiB0aGlzLmdlbmVyYXRlUmVwb3J0KCk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBDTEkgaW50ZXJmYWNlXHJcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xyXG4gIGNvbnN0IGFyZ3MgPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7XHJcbiAgXHJcbiAgY29uc3QgZW52aXJvbm1lbnQgPSBhcmdzLmZpbmQoYXJnID0+IGFyZy5zdGFydHNXaXRoKCctLWVudj0nKSk/LnNwbGl0KCc9JylbMV0gfHwgJ2Rldic7XHJcbiAgY29uc3QgcmVnaW9uID0gYXJncy5maW5kKGFyZyA9PiBhcmcuc3RhcnRzV2l0aCgnLS1yZWdpb249JykpPy5zcGxpdCgnPScpWzFdIHx8ICdldS13ZXN0LTEnO1xyXG4gIFxyXG4gIGlmIChhcmdzLmluY2x1ZGVzKCctLWhlbHAnKSB8fCBhcmdzLmluY2x1ZGVzKCctaCcpKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgXHJcblRyaW5pdHkgUmVzb3VyY2UgTmFtaW5nIFZhbGlkYXRpb25cclxuXHJcblVzYWdlOlxyXG4gIG5weCB0cy1ub2RlIHZhbGlkYXRlLW5hbWluZy50cyBbb3B0aW9uc11cclxuXHJcbk9wdGlvbnM6XHJcbiAgLS1lbnY9PGVudj4gICAgICAgICAgRW52aXJvbm1lbnQgKGRldnxzdGFnaW5nfHByb2R1Y3Rpb24pIFtkZWZhdWx0OiBkZXZdXHJcbiAgLS1yZWdpb249PHJlZ2lvbj4gICAgQVdTIHJlZ2lvbiBbZGVmYXVsdDogZXUtd2VzdC0xXVxyXG4gIC0taGVscCwgLWggICAgICAgICAgU2hvdyB0aGlzIGhlbHAgbWVzc2FnZVxyXG5cclxuRXhhbXBsZXM6XHJcbiAgIyBWYWxpZGF0ZSBuYW1pbmcgaW4gZGV2ZWxvcG1lbnRcclxuICBucHggdHMtbm9kZSB2YWxpZGF0ZS1uYW1pbmcudHMgLS1lbnY9ZGV2XHJcbiAgXHJcbiAgIyBWYWxpZGF0ZSBuYW1pbmcgaW4gcHJvZHVjdGlvblxyXG4gIG5weCB0cy1ub2RlIHZhbGlkYXRlLW5hbWluZy50cyAtLWVudj1wcm9kdWN0aW9uIC0tcmVnaW9uPWV1LXdlc3QtMVxyXG5gKTtcclxuICAgIHByb2Nlc3MuZXhpdCgwKTtcclxuICB9XHJcbiAgXHJcbiAgY29uc3QgdmFsaWRhdG9yID0gbmV3IFRyaW5pdHlOYW1pbmdWYWxpZGF0b3IoZW52aXJvbm1lbnQsIHJlZ2lvbik7XHJcbiAgdmFsaWRhdG9yLmV4ZWN1dGVWYWxpZGF0aW9uKCkudGhlbihyZXBvcnQgPT4ge1xyXG4gICAgY29uc3QgaGFzSXNzdWVzID0gcmVwb3J0LnN1bW1hcnkubm9uQ29tcGxpYW50ID4gMDtcclxuICAgIHByb2Nlc3MuZXhpdChoYXNJc3N1ZXMgPyAxIDogMCk7XHJcbiAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgY29uc29sZS5lcnJvcign4p2MIE5hbWluZyB2YWxpZGF0aW9uIGZhaWxlZDonLCBlcnJvcik7XHJcbiAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IFRyaW5pdHlOYW1pbmdWYWxpZGF0b3IsIE5hbWluZ1ZhbGlkYXRpb25SZXN1bHQsIE5hbWluZ1JlcG9ydCB9OyJdfQ==