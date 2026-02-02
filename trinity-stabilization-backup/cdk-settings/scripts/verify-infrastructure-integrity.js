#!/usr/bin/env ts-node
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
exports.InfrastructureIntegrityVerifier = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
class InfrastructureIntegrityVerifier {
    constructor() {
        this.region = 'eu-west-1';
        this.results = [];
    }
    async verifyAll() {
        console.log('🔍 Verifying Infrastructure Integrity...');
        console.log('📋 Property 10: Infrastructure Integrity - Requirements 7.1');
        await this.verifyCloudFormationStacks();
        await this.verifyDynamoDBTables();
        await this.verifyLambdaFunctions();
        await this.verifyAppSyncAPIs();
        await this.verifyCognitoResources();
        this.generateReport();
        return this.results;
    }
    async verifyCloudFormationStacks() {
        console.log('\n📚 Verifying CloudFormation Stacks...');
        const expectedStacks = [
            'TrinityDatabaseStack',
            'TrinityApiStack',
            'TrinityMainStack',
            'TrinityMatchmakingStack'
        ];
        try {
            const output = (0, child_process_1.execSync)(`aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --region ${this.region} --query "StackSummaries[].StackName" --output text`, { encoding: 'utf8' });
            const existingStacks = output.trim().split('\t');
            const missingStacks = expectedStacks.filter(stack => !existingStacks.includes(stack));
            if (missingStacks.length === 0) {
                this.results.push({
                    component: 'CloudFormation Stacks',
                    status: 'PASS',
                    details: `All ${expectedStacks.length} expected stacks are deployed and in stable state`
                });
                console.log('✅ All CloudFormation stacks verified');
            }
            else {
                this.results.push({
                    component: 'CloudFormation Stacks',
                    status: 'FAIL',
                    details: `Missing stacks: ${missingStacks.join(', ')}`,
                    errors: [`Expected stacks not found: ${missingStacks.join(', ')}`]
                });
                console.log('❌ Missing CloudFormation stacks:', missingStacks);
            }
        }
        catch (error) {
            this.results.push({
                component: 'CloudFormation Stacks',
                status: 'FAIL',
                details: 'Failed to verify stacks',
                errors: [error instanceof Error ? error.message : String(error)]
            });
        }
    }
    async verifyDynamoDBTables() {
        console.log('\n🗄️ Verifying DynamoDB Tables...');
        const expectedTables = [
            'trinity-users-dev',
            'trinity-rooms-dev-v2',
            'trinity-room-members-dev',
            'trinity-room-invites-dev-v2',
            'trinity-votes-dev',
            'trinity-movies-cache-dev',
            'trinity-room-matches-dev',
            'trinity-connections-dev',
            'trinity-room-movie-cache-dev',
            'trinity-room-cache-metadata-dev',
            'trinity-matchmaking-dev',
            'trinity-filter-cache'
        ];
        try {
            const output = (0, child_process_1.execSync)(`aws dynamodb list-tables --region ${this.region} --query "TableNames" --output text`, { encoding: 'utf8' });
            const existingTables = output.trim().split('\t');
            const missingTables = expectedTables.filter(table => !existingTables.includes(table));
            if (missingTables.length === 0) {
                // Verify each table is ACTIVE
                let allActive = true;
                const inactiveTables = [];
                for (const table of expectedTables) {
                    try {
                        const tableStatus = (0, child_process_1.execSync)(`aws dynamodb describe-table --table-name ${table} --region ${this.region} --query "Table.TableStatus" --output text`, { encoding: 'utf8' }).trim();
                        if (tableStatus !== 'ACTIVE') {
                            allActive = false;
                            inactiveTables.push(`${table} (${tableStatus})`);
                        }
                    }
                    catch (error) {
                        allActive = false;
                        inactiveTables.push(`${table} (ERROR)`);
                    }
                }
                if (allActive) {
                    this.results.push({
                        component: 'DynamoDB Tables',
                        status: 'PASS',
                        details: `All ${expectedTables.length} tables are ACTIVE and accessible`
                    });
                    console.log('✅ All DynamoDB tables verified');
                }
                else {
                    this.results.push({
                        component: 'DynamoDB Tables',
                        status: 'FAIL',
                        details: `Some tables are not ACTIVE: ${inactiveTables.join(', ')}`,
                        errors: [`Inactive tables: ${inactiveTables.join(', ')}`]
                    });
                }
            }
            else {
                this.results.push({
                    component: 'DynamoDB Tables',
                    status: 'FAIL',
                    details: `Missing tables: ${missingTables.join(', ')}`,
                    errors: [`Expected tables not found: ${missingTables.join(', ')}`]
                });
                console.log('❌ Missing DynamoDB tables:', missingTables);
            }
        }
        catch (error) {
            this.results.push({
                component: 'DynamoDB Tables',
                status: 'FAIL',
                details: 'Failed to verify tables',
                errors: [error instanceof Error ? error.message : String(error)]
            });
        }
    }
    async verifyLambdaFunctions() {
        console.log('\n⚡ Verifying Lambda Functions...');
        const expectedFunctions = [
            'trinity-auth-dev',
            'trinity-cache-dev',
            'trinity-vote-dev',
            'trinity-room-dev',
            'trinity-movie-dev',
            'trinity-realtime-dev',
            'trinity-vote-consensus-dev'
        ];
        try {
            const output = (0, child_process_1.execSync)(`aws lambda list-functions --region ${this.region} --query "Functions[?contains(FunctionName, 'trinity')].FunctionName" --output text`, { encoding: 'utf8' });
            const existingFunctions = output.trim().split('\t');
            const missingFunctions = expectedFunctions.filter(func => !existingFunctions.includes(func));
            if (missingFunctions.length === 0) {
                this.results.push({
                    component: 'Lambda Functions',
                    status: 'PASS',
                    details: `All ${expectedFunctions.length} Lambda functions are deployed`
                });
                console.log('✅ All Lambda functions verified');
            }
            else {
                this.results.push({
                    component: 'Lambda Functions',
                    status: 'FAIL',
                    details: `Missing functions: ${missingFunctions.join(', ')}`,
                    errors: [`Expected functions not found: ${missingFunctions.join(', ')}`]
                });
                console.log('❌ Missing Lambda functions:', missingFunctions);
            }
        }
        catch (error) {
            this.results.push({
                component: 'Lambda Functions',
                status: 'FAIL',
                details: 'Failed to verify functions',
                errors: [error instanceof Error ? error.message : String(error)]
            });
        }
    }
    async verifyAppSyncAPIs() {
        console.log('\n🔗 Verifying AppSync APIs...');
        const expectedAPIs = ['trinity-api-dev', 'trinity-realtime-api'];
        try {
            const output = (0, child_process_1.execSync)(`aws appsync list-graphql-apis --region ${this.region} --query "graphqlApis[?contains(name, 'trinity')].name" --output text`, { encoding: 'utf8' });
            const existingAPIs = output.trim().split('\t');
            const missingAPIs = expectedAPIs.filter(api => !existingAPIs.includes(api));
            if (missingAPIs.length === 0) {
                this.results.push({
                    component: 'AppSync APIs',
                    status: 'PASS',
                    details: `All ${expectedAPIs.length} GraphQL APIs are deployed`
                });
                console.log('✅ All AppSync APIs verified');
            }
            else {
                this.results.push({
                    component: 'AppSync APIs',
                    status: 'FAIL',
                    details: `Missing APIs: ${missingAPIs.join(', ')}`,
                    errors: [`Expected APIs not found: ${missingAPIs.join(', ')}`]
                });
                console.log('❌ Missing AppSync APIs:', missingAPIs);
            }
        }
        catch (error) {
            this.results.push({
                component: 'AppSync APIs',
                status: 'FAIL',
                details: 'Failed to verify APIs',
                errors: [error instanceof Error ? error.message : String(error)]
            });
        }
    }
    async verifyCognitoResources() {
        console.log('\n🔐 Verifying Cognito Resources...');
        try {
            const output = (0, child_process_1.execSync)(`aws cognito-idp list-user-pools --max-results 20 --region ${this.region} --query "UserPools[?contains(Name, 'trinity')].Name" --output text`, { encoding: 'utf8' });
            const userPools = output.trim().split('\t').filter(pool => pool.length > 0);
            if (userPools.length > 0) {
                this.results.push({
                    component: 'Cognito User Pools',
                    status: 'PASS',
                    details: `Found ${userPools.length} Trinity user pools: ${userPools.join(', ')}`
                });
                console.log('✅ Cognito resources verified');
            }
            else {
                this.results.push({
                    component: 'Cognito User Pools',
                    status: 'FAIL',
                    details: 'No Trinity user pools found',
                    errors: ['Expected at least one Trinity user pool']
                });
                console.log('❌ No Cognito user pools found');
            }
        }
        catch (error) {
            this.results.push({
                component: 'Cognito User Pools',
                status: 'FAIL',
                details: 'Failed to verify Cognito resources',
                errors: [error instanceof Error ? error.message : String(error)]
            });
        }
    }
    generateReport() {
        const reportPath = 'infrastructure-integrity-report.json';
        const summary = {
            timestamp: new Date().toISOString(),
            totalComponents: this.results.length,
            passedComponents: this.results.filter(r => r.status === 'PASS').length,
            failedComponents: this.results.filter(r => r.status === 'FAIL').length,
            overallStatus: this.results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL'
        };
        const report = {
            summary,
            details: this.results
        };
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log('\n📊 Infrastructure Integrity Summary:');
        console.log(`   Total Components: ${summary.totalComponents}`);
        console.log(`   Passed: ${summary.passedComponents}`);
        console.log(`   Failed: ${summary.failedComponents}`);
        console.log(`   Overall Status: ${summary.overallStatus}`);
        console.log(`   Report saved to: ${reportPath}`);
        if (summary.overallStatus === 'PASS') {
            console.log('\n🎉 All infrastructure components verified successfully!');
            console.log('✅ Property 10: Infrastructure Integrity - PASSED');
        }
        else {
            console.log('\n⚠️ Some infrastructure components failed verification');
            console.log('❌ Property 10: Infrastructure Integrity - FAILED');
            const failedComponents = this.results.filter(r => r.status === 'FAIL');
            failedComponents.forEach(component => {
                console.log(`   ❌ ${component.component}: ${component.details}`);
                if (component.errors) {
                    component.errors.forEach(error => console.log(`      - ${error}`));
                }
            });
        }
    }
}
exports.InfrastructureIntegrityVerifier = InfrastructureIntegrityVerifier;
// Execute if run directly
if (require.main === module) {
    const verifier = new InfrastructureIntegrityVerifier();
    verifier.verifyAll().then(results => {
        const overallStatus = results.every(r => r.status === 'PASS');
        process.exit(overallStatus ? 0 : 1);
    }).catch(error => {
        console.error('💥 Verification failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZ5LWluZnJhc3RydWN0dXJlLWludGVncml0eS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZlcmlmeS1pbmZyYXN0cnVjdHVyZS1pbnRlZ3JpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVBLGlEQUF5QztBQUN6Qyx1Q0FBeUI7QUFTekIsTUFBTSwrQkFBK0I7SUFBckM7UUFDbUIsV0FBTSxHQUFHLFdBQVcsQ0FBQztRQUM5QixZQUFPLEdBQXlCLEVBQUUsQ0FBQztJQXNUN0MsQ0FBQztJQXBUQyxLQUFLLENBQUMsU0FBUztRQUNiLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztRQUN4RCxPQUFPLENBQUMsR0FBRyxDQUFDLDZEQUE2RCxDQUFDLENBQUM7UUFFM0UsTUFBTSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztRQUN4QyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDbkMsTUFBTSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUMvQixNQUFNLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBRXBDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN0QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDdEIsQ0FBQztJQUVPLEtBQUssQ0FBQywwQkFBMEI7UUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1FBRXZELE1BQU0sY0FBYyxHQUFHO1lBQ3JCLHNCQUFzQjtZQUN0QixpQkFBaUI7WUFDakIsa0JBQWtCO1lBQ2xCLHlCQUF5QjtTQUMxQixDQUFDO1FBRUYsSUFBSSxDQUFDO1lBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBUSxFQUNyQixpR0FBaUcsSUFBSSxDQUFDLE1BQU0scURBQXFELEVBQ2pL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QyxLQUFLLENBQUMsRUFBRTtRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMseUJBQXlCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEQsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiB0cy1ub2RlXHJcblxyXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcblxyXG5pbnRlcmZhY2UgVmVyaWZpY2F0aW9uUmVzdWx0IHtcclxuICBjb21wb25lbnQ6IHN0cmluZztcclxuICBzdGF0dXM6ICdQQVNTJyB8ICdGQUlMJztcclxuICBkZXRhaWxzOiBzdHJpbmc7XHJcbiAgZXJyb3JzPzogc3RyaW5nW107XHJcbn1cclxuXHJcbmNsYXNzIEluZnJhc3RydWN0dXJlSW50ZWdyaXR5VmVyaWZpZXIge1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgcmVnaW9uID0gJ2V1LXdlc3QtMSc7XHJcbiAgcHJpdmF0ZSByZXN1bHRzOiBWZXJpZmljYXRpb25SZXN1bHRbXSA9IFtdO1xyXG5cclxuICBhc3luYyB2ZXJpZnlBbGwoKTogUHJvbWlzZTxWZXJpZmljYXRpb25SZXN1bHRbXT4ge1xyXG4gICAgY29uc29sZS5sb2coJ/CflI0gVmVyaWZ5aW5nIEluZnJhc3RydWN0dXJlIEludGVncml0eS4uLicpO1xyXG4gICAgY29uc29sZS5sb2coJ/Cfk4sgUHJvcGVydHkgMTA6IEluZnJhc3RydWN0dXJlIEludGVncml0eSAtIFJlcXVpcmVtZW50cyA3LjEnKTtcclxuICAgIFxyXG4gICAgYXdhaXQgdGhpcy52ZXJpZnlDbG91ZEZvcm1hdGlvblN0YWNrcygpO1xyXG4gICAgYXdhaXQgdGhpcy52ZXJpZnlEeW5hbW9EQlRhYmxlcygpO1xyXG4gICAgYXdhaXQgdGhpcy52ZXJpZnlMYW1iZGFGdW5jdGlvbnMoKTtcclxuICAgIGF3YWl0IHRoaXMudmVyaWZ5QXBwU3luY0FQSXMoKTtcclxuICAgIGF3YWl0IHRoaXMudmVyaWZ5Q29nbml0b1Jlc291cmNlcygpO1xyXG4gICAgXHJcbiAgICB0aGlzLmdlbmVyYXRlUmVwb3J0KCk7XHJcbiAgICByZXR1cm4gdGhpcy5yZXN1bHRzO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlDbG91ZEZvcm1hdGlvblN0YWNrcygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OaIFZlcmlmeWluZyBDbG91ZEZvcm1hdGlvbiBTdGFja3MuLi4nKTtcclxuICAgIFxyXG4gICAgY29uc3QgZXhwZWN0ZWRTdGFja3MgPSBbXHJcbiAgICAgICdUcmluaXR5RGF0YWJhc2VTdGFjaycsXHJcbiAgICAgICdUcmluaXR5QXBpU3RhY2snLCBcclxuICAgICAgJ1RyaW5pdHlNYWluU3RhY2snLFxyXG4gICAgICAnVHJpbml0eU1hdGNobWFraW5nU3RhY2snXHJcbiAgICBdO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG91dHB1dCA9IGV4ZWNTeW5jKFxyXG4gICAgICAgIGBhd3MgY2xvdWRmb3JtYXRpb24gbGlzdC1zdGFja3MgLS1zdGFjay1zdGF0dXMtZmlsdGVyIENSRUFURV9DT01QTEVURSBVUERBVEVfQ09NUExFVEUgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1xdWVyeSBcIlN0YWNrU3VtbWFyaWVzW10uU3RhY2tOYW1lXCIgLS1vdXRwdXQgdGV4dGAsXHJcbiAgICAgICAgeyBlbmNvZGluZzogJ3V0ZjgnIH1cclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nU3RhY2tzID0gb3V0cHV0LnRyaW0oKS5zcGxpdCgnXFx0Jyk7XHJcbiAgICAgIGNvbnN0IG1pc3NpbmdTdGFja3MgPSBleHBlY3RlZFN0YWNrcy5maWx0ZXIoc3RhY2sgPT4gIWV4aXN0aW5nU3RhY2tzLmluY2x1ZGVzKHN0YWNrKSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAobWlzc2luZ1N0YWNrcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICBjb21wb25lbnQ6ICdDbG91ZEZvcm1hdGlvbiBTdGFja3MnLFxyXG4gICAgICAgICAgc3RhdHVzOiAnUEFTUycsXHJcbiAgICAgICAgICBkZXRhaWxzOiBgQWxsICR7ZXhwZWN0ZWRTdGFja3MubGVuZ3RofSBleHBlY3RlZCBzdGFja3MgYXJlIGRlcGxveWVkIGFuZCBpbiBzdGFibGUgc3RhdGVgXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgQ2xvdWRGb3JtYXRpb24gc3RhY2tzIHZlcmlmaWVkJyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY29tcG9uZW50OiAnQ2xvdWRGb3JtYXRpb24gU3RhY2tzJyxcclxuICAgICAgICAgIHN0YXR1czogJ0ZBSUwnLFxyXG4gICAgICAgICAgZGV0YWlsczogYE1pc3Npbmcgc3RhY2tzOiAke21pc3NpbmdTdGFja3Muam9pbignLCAnKX1gLFxyXG4gICAgICAgICAgZXJyb3JzOiBbYEV4cGVjdGVkIHN0YWNrcyBub3QgZm91bmQ6ICR7bWlzc2luZ1N0YWNrcy5qb2luKCcsICcpfWBdXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KdjCBNaXNzaW5nIENsb3VkRm9ybWF0aW9uIHN0YWNrczonLCBtaXNzaW5nU3RhY2tzKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgIGNvbXBvbmVudDogJ0Nsb3VkRm9ybWF0aW9uIFN0YWNrcycsXHJcbiAgICAgICAgc3RhdHVzOiAnRkFJTCcsXHJcbiAgICAgICAgZGV0YWlsczogJ0ZhaWxlZCB0byB2ZXJpZnkgc3RhY2tzJyxcclxuICAgICAgICBlcnJvcnM6IFtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcildXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlEeW5hbW9EQlRhYmxlcygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5eE77iPIFZlcmlmeWluZyBEeW5hbW9EQiBUYWJsZXMuLi4nKTtcclxuICAgIFxyXG4gICAgY29uc3QgZXhwZWN0ZWRUYWJsZXMgPSBbXHJcbiAgICAgICd0cmluaXR5LXVzZXJzLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJvb21zLWRldi12MicsIFxyXG4gICAgICAndHJpbml0eS1yb29tLW1lbWJlcnMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbS1pbnZpdGVzLWRldi12MicsXHJcbiAgICAgICd0cmluaXR5LXZvdGVzLWRldicsXHJcbiAgICAgICd0cmluaXR5LW1vdmllcy1jYWNoZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tLW1hdGNoZXMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktY29ubmVjdGlvbnMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbS1tb3ZpZS1jYWNoZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tLWNhY2hlLW1ldGFkYXRhLWRldicsXHJcbiAgICAgICd0cmluaXR5LW1hdGNobWFraW5nLWRldicsXHJcbiAgICAgICd0cmluaXR5LWZpbHRlci1jYWNoZSdcclxuICAgIF07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgb3V0cHV0ID0gZXhlY1N5bmMoXHJcbiAgICAgICAgYGF3cyBkeW5hbW9kYiBsaXN0LXRhYmxlcyAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwiVGFibGVOYW1lc1wiIC0tb3V0cHV0IHRleHRgLFxyXG4gICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBleGlzdGluZ1RhYmxlcyA9IG91dHB1dC50cmltKCkuc3BsaXQoJ1xcdCcpO1xyXG4gICAgICBjb25zdCBtaXNzaW5nVGFibGVzID0gZXhwZWN0ZWRUYWJsZXMuZmlsdGVyKHRhYmxlID0+ICFleGlzdGluZ1RhYmxlcy5pbmNsdWRlcyh0YWJsZSkpO1xyXG4gICAgICBcclxuICAgICAgaWYgKG1pc3NpbmdUYWJsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgLy8gVmVyaWZ5IGVhY2ggdGFibGUgaXMgQUNUSVZFXHJcbiAgICAgICAgbGV0IGFsbEFjdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgY29uc3QgaW5hY3RpdmVUYWJsZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChjb25zdCB0YWJsZSBvZiBleHBlY3RlZFRhYmxlcykge1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgdGFibGVTdGF0dXMgPSBleGVjU3luYyhcclxuICAgICAgICAgICAgICBgYXdzIGR5bmFtb2RiIGRlc2NyaWJlLXRhYmxlIC0tdGFibGUtbmFtZSAke3RhYmxlfSAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwiVGFibGUuVGFibGVTdGF0dXNcIiAtLW91dHB1dCB0ZXh0YCxcclxuICAgICAgICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxyXG4gICAgICAgICAgICApLnRyaW0oKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh0YWJsZVN0YXR1cyAhPT0gJ0FDVElWRScpIHtcclxuICAgICAgICAgICAgICBhbGxBY3RpdmUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICBpbmFjdGl2ZVRhYmxlcy5wdXNoKGAke3RhYmxlfSAoJHt0YWJsZVN0YXR1c30pYCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGFsbEFjdGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICBpbmFjdGl2ZVRhYmxlcy5wdXNoKGAke3RhYmxlfSAoRVJST1IpYCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhbGxBY3RpdmUpIHtcclxuICAgICAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICAgICAgY29tcG9uZW50OiAnRHluYW1vREIgVGFibGVzJyxcclxuICAgICAgICAgICAgc3RhdHVzOiAnUEFTUycsXHJcbiAgICAgICAgICAgIGRldGFpbHM6IGBBbGwgJHtleHBlY3RlZFRhYmxlcy5sZW5ndGh9IHRhYmxlcyBhcmUgQUNUSVZFIGFuZCBhY2Nlc3NpYmxlYFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygn4pyFIEFsbCBEeW5hbW9EQiB0YWJsZXMgdmVyaWZpZWQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgICBjb21wb25lbnQ6ICdEeW5hbW9EQiBUYWJsZXMnLFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdGQUlMJyxcclxuICAgICAgICAgICAgZGV0YWlsczogYFNvbWUgdGFibGVzIGFyZSBub3QgQUNUSVZFOiAke2luYWN0aXZlVGFibGVzLmpvaW4oJywgJyl9YCxcclxuICAgICAgICAgICAgZXJyb3JzOiBbYEluYWN0aXZlIHRhYmxlczogJHtpbmFjdGl2ZVRhYmxlcy5qb2luKCcsICcpfWBdXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY29tcG9uZW50OiAnRHluYW1vREIgVGFibGVzJyxcclxuICAgICAgICAgIHN0YXR1czogJ0ZBSUwnLFxyXG4gICAgICAgICAgZGV0YWlsczogYE1pc3NpbmcgdGFibGVzOiAke21pc3NpbmdUYWJsZXMuam9pbignLCAnKX1gLFxyXG4gICAgICAgICAgZXJyb3JzOiBbYEV4cGVjdGVkIHRhYmxlcyBub3QgZm91bmQ6ICR7bWlzc2luZ1RhYmxlcy5qb2luKCcsICcpfWBdXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KdjCBNaXNzaW5nIER5bmFtb0RCIHRhYmxlczonLCBtaXNzaW5nVGFibGVzKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgIGNvbXBvbmVudDogJ0R5bmFtb0RCIFRhYmxlcycsXHJcbiAgICAgICAgc3RhdHVzOiAnRkFJTCcsXHJcbiAgICAgICAgZGV0YWlsczogJ0ZhaWxlZCB0byB2ZXJpZnkgdGFibGVzJyxcclxuICAgICAgICBlcnJvcnM6IFtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcildXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlMYW1iZGFGdW5jdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu4pqhIFZlcmlmeWluZyBMYW1iZGEgRnVuY3Rpb25zLi4uJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGV4cGVjdGVkRnVuY3Rpb25zID0gW1xyXG4gICAgICAndHJpbml0eS1hdXRoLWRldicsXHJcbiAgICAgICd0cmluaXR5LWNhY2hlLWRldicsIFxyXG4gICAgICAndHJpbml0eS12b3RlLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJvb20tZGV2JyxcclxuICAgICAgJ3RyaW5pdHktbW92aWUtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcmVhbHRpbWUtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktdm90ZS1jb25zZW5zdXMtZGV2J1xyXG4gICAgXTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBvdXRwdXQgPSBleGVjU3luYyhcclxuICAgICAgICBgYXdzIGxhbWJkYSBsaXN0LWZ1bmN0aW9ucyAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwiRnVuY3Rpb25zWz9jb250YWlucyhGdW5jdGlvbk5hbWUsICd0cmluaXR5JyldLkZ1bmN0aW9uTmFtZVwiIC0tb3V0cHV0IHRleHRgLFxyXG4gICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBleGlzdGluZ0Z1bmN0aW9ucyA9IG91dHB1dC50cmltKCkuc3BsaXQoJ1xcdCcpO1xyXG4gICAgICBjb25zdCBtaXNzaW5nRnVuY3Rpb25zID0gZXhwZWN0ZWRGdW5jdGlvbnMuZmlsdGVyKGZ1bmMgPT4gIWV4aXN0aW5nRnVuY3Rpb25zLmluY2x1ZGVzKGZ1bmMpKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChtaXNzaW5nRnVuY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICAgIGNvbXBvbmVudDogJ0xhbWJkYSBGdW5jdGlvbnMnLFxyXG4gICAgICAgICAgc3RhdHVzOiAnUEFTUycsXHJcbiAgICAgICAgICBkZXRhaWxzOiBgQWxsICR7ZXhwZWN0ZWRGdW5jdGlvbnMubGVuZ3RofSBMYW1iZGEgZnVuY3Rpb25zIGFyZSBkZXBsb3llZGBcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZygn4pyFIEFsbCBMYW1iZGEgZnVuY3Rpb25zIHZlcmlmaWVkJyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY29tcG9uZW50OiAnTGFtYmRhIEZ1bmN0aW9ucycsXHJcbiAgICAgICAgICBzdGF0dXM6ICdGQUlMJyxcclxuICAgICAgICAgIGRldGFpbHM6IGBNaXNzaW5nIGZ1bmN0aW9uczogJHttaXNzaW5nRnVuY3Rpb25zLmpvaW4oJywgJyl9YCxcclxuICAgICAgICAgIGVycm9yczogW2BFeHBlY3RlZCBmdW5jdGlvbnMgbm90IGZvdW5kOiAke21pc3NpbmdGdW5jdGlvbnMuam9pbignLCAnKX1gXVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfinYwgTWlzc2luZyBMYW1iZGEgZnVuY3Rpb25zOicsIG1pc3NpbmdGdW5jdGlvbnMpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgY29tcG9uZW50OiAnTGFtYmRhIEZ1bmN0aW9ucycsXHJcbiAgICAgICAgc3RhdHVzOiAnRkFJTCcsXHJcbiAgICAgICAgZGV0YWlsczogJ0ZhaWxlZCB0byB2ZXJpZnkgZnVuY3Rpb25zJyxcclxuICAgICAgICBlcnJvcnM6IFtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcildXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlBcHBTeW5jQVBJcygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5SXIFZlcmlmeWluZyBBcHBTeW5jIEFQSXMuLi4nKTtcclxuICAgIFxyXG4gICAgY29uc3QgZXhwZWN0ZWRBUElzID0gWyd0cmluaXR5LWFwaS1kZXYnLCAndHJpbml0eS1yZWFsdGltZS1hcGknXTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBvdXRwdXQgPSBleGVjU3luYyhcclxuICAgICAgICBgYXdzIGFwcHN5bmMgbGlzdC1ncmFwaHFsLWFwaXMgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1xdWVyeSBcImdyYXBocWxBcGlzWz9jb250YWlucyhuYW1lLCAndHJpbml0eScpXS5uYW1lXCIgLS1vdXRwdXQgdGV4dGAsXHJcbiAgICAgICAgeyBlbmNvZGluZzogJ3V0ZjgnIH1cclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nQVBJcyA9IG91dHB1dC50cmltKCkuc3BsaXQoJ1xcdCcpO1xyXG4gICAgICBjb25zdCBtaXNzaW5nQVBJcyA9IGV4cGVjdGVkQVBJcy5maWx0ZXIoYXBpID0+ICFleGlzdGluZ0FQSXMuaW5jbHVkZXMoYXBpKSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAobWlzc2luZ0FQSXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY29tcG9uZW50OiAnQXBwU3luYyBBUElzJyxcclxuICAgICAgICAgIHN0YXR1czogJ1BBU1MnLFxyXG4gICAgICAgICAgZGV0YWlsczogYEFsbCAke2V4cGVjdGVkQVBJcy5sZW5ndGh9IEdyYXBoUUwgQVBJcyBhcmUgZGVwbG95ZWRgXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgQXBwU3luYyBBUElzIHZlcmlmaWVkJyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY29tcG9uZW50OiAnQXBwU3luYyBBUElzJyxcclxuICAgICAgICAgIHN0YXR1czogJ0ZBSUwnLFxyXG4gICAgICAgICAgZGV0YWlsczogYE1pc3NpbmcgQVBJczogJHttaXNzaW5nQVBJcy5qb2luKCcsICcpfWAsXHJcbiAgICAgICAgICBlcnJvcnM6IFtgRXhwZWN0ZWQgQVBJcyBub3QgZm91bmQ6ICR7bWlzc2luZ0FQSXMuam9pbignLCAnKX1gXVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfinYwgTWlzc2luZyBBcHBTeW5jIEFQSXM6JywgbWlzc2luZ0FQSXMpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgY29tcG9uZW50OiAnQXBwU3luYyBBUElzJyxcclxuICAgICAgICBzdGF0dXM6ICdGQUlMJyxcclxuICAgICAgICBkZXRhaWxzOiAnRmFpbGVkIHRvIHZlcmlmeSBBUElzJyxcclxuICAgICAgICBlcnJvcnM6IFtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcildXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlDb2duaXRvUmVzb3VyY2VzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCflJAgVmVyaWZ5aW5nIENvZ25pdG8gUmVzb3VyY2VzLi4uJyk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG91dHB1dCA9IGV4ZWNTeW5jKFxyXG4gICAgICAgIGBhd3MgY29nbml0by1pZHAgbGlzdC11c2VyLXBvb2xzIC0tbWF4LXJlc3VsdHMgMjAgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1xdWVyeSBcIlVzZXJQb29sc1s/Y29udGFpbnMoTmFtZSwgJ3RyaW5pdHknKV0uTmFtZVwiIC0tb3V0cHV0IHRleHRgLFxyXG4gICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCB1c2VyUG9vbHMgPSBvdXRwdXQudHJpbSgpLnNwbGl0KCdcXHQnKS5maWx0ZXIocG9vbCA9PiBwb29sLmxlbmd0aCA+IDApO1xyXG4gICAgICBcclxuICAgICAgaWYgKHVzZXJQb29scy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY29tcG9uZW50OiAnQ29nbml0byBVc2VyIFBvb2xzJyxcclxuICAgICAgICAgIHN0YXR1czogJ1BBU1MnLFxyXG4gICAgICAgICAgZGV0YWlsczogYEZvdW5kICR7dXNlclBvb2xzLmxlbmd0aH0gVHJpbml0eSB1c2VyIHBvb2xzOiAke3VzZXJQb29scy5qb2luKCcsICcpfWBcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZygn4pyFIENvZ25pdG8gcmVzb3VyY2VzIHZlcmlmaWVkJyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY29tcG9uZW50OiAnQ29nbml0byBVc2VyIFBvb2xzJyxcclxuICAgICAgICAgIHN0YXR1czogJ0ZBSUwnLFxyXG4gICAgICAgICAgZGV0YWlsczogJ05vIFRyaW5pdHkgdXNlciBwb29scyBmb3VuZCcsXHJcbiAgICAgICAgICBlcnJvcnM6IFsnRXhwZWN0ZWQgYXQgbGVhc3Qgb25lIFRyaW5pdHkgdXNlciBwb29sJ11cclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZygn4p2MIE5vIENvZ25pdG8gdXNlciBwb29scyBmb3VuZCcpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgY29tcG9uZW50OiAnQ29nbml0byBVc2VyIFBvb2xzJyxcclxuICAgICAgICBzdGF0dXM6ICdGQUlMJyxcclxuICAgICAgICBkZXRhaWxzOiAnRmFpbGVkIHRvIHZlcmlmeSBDb2duaXRvIHJlc291cmNlcycsXHJcbiAgICAgICAgZXJyb3JzOiBbZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpXVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2VuZXJhdGVSZXBvcnQoKTogdm9pZCB7XHJcbiAgICBjb25zdCByZXBvcnRQYXRoID0gJ2luZnJhc3RydWN0dXJlLWludGVncml0eS1yZXBvcnQuanNvbic7XHJcbiAgICBcclxuICAgIGNvbnN0IHN1bW1hcnkgPSB7XHJcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB0b3RhbENvbXBvbmVudHM6IHRoaXMucmVzdWx0cy5sZW5ndGgsXHJcbiAgICAgIHBhc3NlZENvbXBvbmVudHM6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ1BBU1MnKS5sZW5ndGgsXHJcbiAgICAgIGZhaWxlZENvbXBvbmVudHM6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ0ZBSUwnKS5sZW5ndGgsXHJcbiAgICAgIG92ZXJhbGxTdGF0dXM6IHRoaXMucmVzdWx0cy5ldmVyeShyID0+IHIuc3RhdHVzID09PSAnUEFTUycpID8gJ1BBU1MnIDogJ0ZBSUwnXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBjb25zdCByZXBvcnQgPSB7XHJcbiAgICAgIHN1bW1hcnksXHJcbiAgICAgIGRldGFpbHM6IHRoaXMucmVzdWx0c1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnMud3JpdGVGaWxlU3luYyhyZXBvcnRQYXRoLCBKU09OLnN0cmluZ2lmeShyZXBvcnQsIG51bGwsIDIpKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfk4ogSW5mcmFzdHJ1Y3R1cmUgSW50ZWdyaXR5IFN1bW1hcnk6Jyk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAgVG90YWwgQ29tcG9uZW50czogJHtzdW1tYXJ5LnRvdGFsQ29tcG9uZW50c31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBQYXNzZWQ6ICR7c3VtbWFyeS5wYXNzZWRDb21wb25lbnRzfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIEZhaWxlZDogJHtzdW1tYXJ5LmZhaWxlZENvbXBvbmVudHN9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAgT3ZlcmFsbCBTdGF0dXM6ICR7c3VtbWFyeS5vdmVyYWxsU3RhdHVzfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIFJlcG9ydCBzYXZlZCB0bzogJHtyZXBvcnRQYXRofWApO1xyXG4gICAgXHJcbiAgICBpZiAoc3VtbWFyeS5vdmVyYWxsU3RhdHVzID09PSAnUEFTUycpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1xcbvCfjokgQWxsIGluZnJhc3RydWN0dXJlIGNvbXBvbmVudHMgdmVyaWZpZWQgc3VjY2Vzc2Z1bGx5IScpO1xyXG4gICAgICBjb25zb2xlLmxvZygn4pyFIFByb3BlcnR5IDEwOiBJbmZyYXN0cnVjdHVyZSBJbnRlZ3JpdHkgLSBQQVNTRUQnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7imqDvuI8gU29tZSBpbmZyYXN0cnVjdHVyZSBjb21wb25lbnRzIGZhaWxlZCB2ZXJpZmljYXRpb24nKTtcclxuICAgICAgY29uc29sZS5sb2coJ+KdjCBQcm9wZXJ0eSAxMDogSW5mcmFzdHJ1Y3R1cmUgSW50ZWdyaXR5IC0gRkFJTEVEJyk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBmYWlsZWRDb21wb25lbnRzID0gdGhpcy5yZXN1bHRzLmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnRkFJTCcpO1xyXG4gICAgICBmYWlsZWRDb21wb25lbnRzLmZvckVhY2goY29tcG9uZW50ID0+IHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAg4p2MICR7Y29tcG9uZW50LmNvbXBvbmVudH06ICR7Y29tcG9uZW50LmRldGFpbHN9YCk7XHJcbiAgICAgICAgaWYgKGNvbXBvbmVudC5lcnJvcnMpIHtcclxuICAgICAgICAgIGNvbXBvbmVudC5lcnJvcnMuZm9yRWFjaChlcnJvciA9PiBjb25zb2xlLmxvZyhgICAgICAgLSAke2Vycm9yfWApKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLy8gRXhlY3V0ZSBpZiBydW4gZGlyZWN0bHlcclxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XHJcbiAgY29uc3QgdmVyaWZpZXIgPSBuZXcgSW5mcmFzdHJ1Y3R1cmVJbnRlZ3JpdHlWZXJpZmllcigpO1xyXG4gIHZlcmlmaWVyLnZlcmlmeUFsbCgpLnRoZW4ocmVzdWx0cyA9PiB7XHJcbiAgICBjb25zdCBvdmVyYWxsU3RhdHVzID0gcmVzdWx0cy5ldmVyeShyID0+IHIuc3RhdHVzID09PSAnUEFTUycpO1xyXG4gICAgcHJvY2Vzcy5leGl0KG92ZXJhbGxTdGF0dXMgPyAwIDogMSk7XHJcbiAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgY29uc29sZS5lcnJvcign8J+SpSBWZXJpZmljYXRpb24gZmFpbGVkOicsIGVycm9yKTtcclxuICAgIHByb2Nlc3MuZXhpdCgxKTtcclxuICB9KTtcclxufVxyXG5cclxuZXhwb3J0IHsgSW5mcmFzdHJ1Y3R1cmVJbnRlZ3JpdHlWZXJpZmllciB9OyJdfQ==