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
exports.SecurityComplianceValidator = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
class SecurityComplianceValidator {
    constructor() {
        this.region = 'eu-west-1';
        this.results = [];
    }
    async validateAll() {
        console.log('🔒 Validating Security and Compliance...');
        console.log('📋 Requirements 10.1-10.7: Security, IAM, Encryption, Monitoring');
        await this.validateEncryption();
        await this.validateIAMPolicies();
        await this.validateNetworkSecurity();
        await this.validateMonitoring();
        await this.validateDataProtection();
        await this.validateAccessControl();
        await this.validateAuditLogging();
        this.generateReport();
        return this.results;
    }
    async validateEncryption() {
        console.log('\n🔐 Validating Encryption at Rest and in Transit...');
        // Check DynamoDB encryption
        const tables = [
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
        let encryptedTables = 0;
        let totalTables = tables.length;
        for (const table of tables) {
            try {
                const output = (0, child_process_1.execSync)(`aws dynamodb describe-table --table-name ${table} --region ${this.region} --query "Table.SSEDescription.Status" --output text`, { encoding: 'utf8' });
                const encryptionStatus = output.trim();
                if (encryptionStatus === 'ENABLED') {
                    encryptedTables++;
                }
            }
            catch (error) {
                // Table might not have encryption info, which is acceptable for some use cases
            }
        }
        if (encryptedTables === totalTables) {
            this.results.push({
                category: 'Encryption',
                check: 'DynamoDB Encryption at Rest',
                status: 'PASS',
                details: `All ${totalTables} DynamoDB tables have encryption at rest enabled`
            });
        }
        else {
            this.results.push({
                category: 'Encryption',
                check: 'DynamoDB Encryption at Rest',
                status: 'WARNING',
                details: `${encryptedTables}/${totalTables} tables have encryption enabled`,
                recommendation: 'Enable encryption at rest for all DynamoDB tables in production'
            });
        }
        // Check Lambda environment variable encryption
        const lambdaFunctions = [
            'trinity-auth-dev',
            'trinity-cache-dev',
            'trinity-vote-dev',
            'trinity-room-dev',
            'trinity-movie-dev',
            'trinity-realtime-dev',
            'trinity-vote-consensus-dev'
        ];
        let encryptedFunctions = 0;
        for (const func of lambdaFunctions) {
            try {
                const output = (0, child_process_1.execSync)(`aws lambda get-function-configuration --function-name ${func} --region ${this.region} --query "KMSKeyArn" --output text`, { encoding: 'utf8' });
                if (output.trim() !== 'None' && output.trim() !== '') {
                    encryptedFunctions++;
                }
            }
            catch (error) {
                // Function might not exist or have KMS encryption
            }
        }
        this.results.push({
            category: 'Encryption',
            check: 'Lambda Environment Variables Encryption',
            status: encryptedFunctions > 0 ? 'PASS' : 'WARNING',
            details: `${encryptedFunctions}/${lambdaFunctions.length} Lambda functions use KMS encryption for environment variables`,
            recommendation: encryptedFunctions === 0 ? 'Enable KMS encryption for Lambda environment variables containing sensitive data' : undefined
        });
        console.log(`   ✅ Encryption validation completed`);
    }
    async validateIAMPolicies() {
        console.log('\n👤 Validating IAM Policies and Least Privilege...');
        try {
            // Check for overly permissive policies
            const output = (0, child_process_1.execSync)(`aws iam list-roles --query "Roles[?contains(RoleName, 'Trinity')].RoleName" --output text --region ${this.region}`, { encoding: 'utf8' });
            const trinityRoles = output.trim().split('\t').filter(role => role.length > 0);
            if (trinityRoles.length > 0) {
                this.results.push({
                    category: 'IAM',
                    check: 'Trinity IAM Roles',
                    status: 'PASS',
                    details: `Found ${trinityRoles.length} Trinity-related IAM roles: ${trinityRoles.join(', ')}`
                });
                // Check for wildcard permissions (basic check)
                let hasWildcardPolicies = false;
                for (const role of trinityRoles) {
                    try {
                        const policiesOutput = (0, child_process_1.execSync)(`aws iam list-attached-role-policies --role-name ${role} --region ${this.region} --query "AttachedPolicies[].PolicyArn" --output text`, { encoding: 'utf8' });
                        // This is a basic check - in production, you'd want more detailed policy analysis
                        if (policiesOutput.includes('*')) {
                            hasWildcardPolicies = true;
                        }
                    }
                    catch (error) {
                        // Role might not have attached policies
                    }
                }
                this.results.push({
                    category: 'IAM',
                    check: 'Least Privilege Principle',
                    status: hasWildcardPolicies ? 'WARNING' : 'PASS',
                    details: hasWildcardPolicies ? 'Some roles may have overly broad permissions' : 'No obvious wildcard permissions detected',
                    recommendation: hasWildcardPolicies ? 'Review IAM policies to ensure least privilege access' : undefined
                });
            }
            else {
                this.results.push({
                    category: 'IAM',
                    check: 'Trinity IAM Roles',
                    status: 'WARNING',
                    details: 'No Trinity-specific IAM roles found',
                    recommendation: 'Ensure proper IAM roles are configured for Trinity resources'
                });
            }
        }
        catch (error) {
            this.results.push({
                category: 'IAM',
                check: 'IAM Policy Validation',
                status: 'FAIL',
                details: `Failed to validate IAM policies: ${error instanceof Error ? error.message : String(error)}`,
                recommendation: 'Manually review IAM policies for Trinity resources'
            });
        }
        console.log(`   ✅ IAM validation completed`);
    }
    async validateNetworkSecurity() {
        console.log('\n🌐 Validating Network Security...');
        // Check AppSync API authentication
        try {
            const output = (0, child_process_1.execSync)(`aws appsync list-graphql-apis --region ${this.region} --query "graphqlApis[?contains(name, 'trinity')].authenticationType" --output text`, { encoding: 'utf8' });
            const authTypes = output.trim().split('\t').filter(type => type.length > 0);
            if (authTypes.length > 0) {
                const hasSecureAuth = authTypes.some(type => ['AWS_IAM', 'AMAZON_COGNITO_USER_POOLS'].includes(type));
                this.results.push({
                    category: 'Network Security',
                    check: 'AppSync Authentication',
                    status: hasSecureAuth ? 'PASS' : 'WARNING',
                    details: `AppSync APIs use authentication types: ${authTypes.join(', ')}`,
                    recommendation: hasSecureAuth ? undefined : 'Ensure AppSync APIs use secure authentication (IAM or Cognito)'
                });
            }
        }
        catch (error) {
            this.results.push({
                category: 'Network Security',
                check: 'AppSync Authentication',
                status: 'WARNING',
                details: 'Could not validate AppSync authentication configuration',
                recommendation: 'Manually verify AppSync API authentication settings'
            });
        }
        // Check Lambda function URLs (should not be public)
        const lambdaFunctions = [
            'trinity-auth-dev',
            'trinity-cache-dev',
            'trinity-vote-dev',
            'trinity-room-dev',
            'trinity-movie-dev',
            'trinity-realtime-dev',
            'trinity-vote-consensus-dev'
        ];
        let publicFunctions = 0;
        for (const func of lambdaFunctions) {
            try {
                const output = (0, child_process_1.execSync)(`aws lambda get-function-url-config --function-name ${func} --region ${this.region} --query "AuthType" --output text`, { encoding: 'utf8' });
                if (output.trim() === 'NONE') {
                    publicFunctions++;
                }
            }
            catch (error) {
                // Function might not have a URL config, which is good for security
            }
        }
        this.results.push({
            category: 'Network Security',
            check: 'Lambda Function URLs',
            status: publicFunctions === 0 ? 'PASS' : 'WARNING',
            details: `${publicFunctions} Lambda functions have public URLs`,
            recommendation: publicFunctions > 0 ? 'Review Lambda function URLs and ensure they require authentication' : undefined
        });
        console.log(`   ✅ Network security validation completed`);
    }
    async validateMonitoring() {
        console.log('\n📊 Validating Monitoring and Alerting...');
        try {
            // Check CloudWatch alarms
            const output = (0, child_process_1.execSync)(`aws cloudwatch describe-alarms --region ${this.region} --query "MetricAlarms[?contains(AlarmName, 'Trinity') || contains(AlarmName, 'trinity')].AlarmName" --output text`, { encoding: 'utf8' });
            const alarms = output.trim().split('\t').filter(alarm => alarm.length > 0);
            this.results.push({
                category: 'Monitoring',
                check: 'CloudWatch Alarms',
                status: alarms.length > 0 ? 'PASS' : 'WARNING',
                details: `Found ${alarms.length} Trinity-related CloudWatch alarms`,
                recommendation: alarms.length === 0 ? 'Set up CloudWatch alarms for critical metrics (errors, latency, throttling)' : undefined
            });
            // Check CloudWatch Logs retention
            const logGroups = [
                '/aws/lambda/trinity-auth-dev',
                '/aws/lambda/trinity-cache-dev',
                '/aws/lambda/trinity-vote-dev',
                '/aws/lambda/trinity-room-dev',
                '/aws/lambda/trinity-movie-dev',
                '/aws/lambda/trinity-realtime-dev',
                '/aws/lambda/trinity-vote-consensus-dev'
            ];
            let retentionConfigured = 0;
            for (const logGroup of logGroups) {
                try {
                    const retentionOutput = (0, child_process_1.execSync)(`aws logs describe-log-groups --log-group-name-prefix ${logGroup} --region ${this.region} --query "logGroups[0].retentionInDays" --output text`, { encoding: 'utf8' });
                    if (retentionOutput.trim() !== 'None' && retentionOutput.trim() !== '') {
                        retentionConfigured++;
                    }
                }
                catch (error) {
                    // Log group might not exist
                }
            }
            this.results.push({
                category: 'Monitoring',
                check: 'CloudWatch Logs Retention',
                status: retentionConfigured > 0 ? 'PASS' : 'WARNING',
                details: `${retentionConfigured}/${logGroups.length} log groups have retention policies configured`,
                recommendation: retentionConfigured === 0 ? 'Configure log retention policies to manage costs and compliance' : undefined
            });
        }
        catch (error) {
            this.results.push({
                category: 'Monitoring',
                check: 'Monitoring Configuration',
                status: 'WARNING',
                details: 'Could not validate monitoring configuration',
                recommendation: 'Manually verify CloudWatch monitoring and alerting setup'
            });
        }
        console.log(`   ✅ Monitoring validation completed`);
    }
    async validateDataProtection() {
        console.log('\n🛡️ Validating Data Protection...');
        // Check DynamoDB point-in-time recovery
        const tables = [
            'trinity-users-dev',
            'trinity-rooms-dev-v2',
            'trinity-votes-dev',
            'trinity-room-matches-dev'
        ]; // Critical tables that should have PITR
        let pitrEnabled = 0;
        for (const table of tables) {
            try {
                const output = (0, child_process_1.execSync)(`aws dynamodb describe-continuous-backups --table-name ${table} --region ${this.region} --query "ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus" --output text`, { encoding: 'utf8' });
                if (output.trim() === 'ENABLED') {
                    pitrEnabled++;
                }
            }
            catch (error) {
                // Table might not have PITR configured
            }
        }
        this.results.push({
            category: 'Data Protection',
            check: 'DynamoDB Point-in-Time Recovery',
            status: pitrEnabled === tables.length ? 'PASS' : 'WARNING',
            details: `${pitrEnabled}/${tables.length} critical tables have point-in-time recovery enabled`,
            recommendation: pitrEnabled < tables.length ? 'Enable point-in-time recovery for critical DynamoDB tables' : undefined
        });
        // Check for sensitive data handling in Lambda code
        const sensitivePatterns = [
            'password',
            'secret',
            'api_key',
            'private_key',
            'token'
        ];
        let potentialIssues = 0;
        try {
            for (const pattern of sensitivePatterns) {
                const searchResult = (0, child_process_1.execSync)(`grep -r -i "${pattern}" src/ || true`, { encoding: 'utf8', cwd: process.cwd() });
                if (searchResult.trim().length > 0) {
                    potentialIssues++;
                }
            }
            this.results.push({
                category: 'Data Protection',
                check: 'Sensitive Data in Code',
                status: potentialIssues === 0 ? 'PASS' : 'WARNING',
                details: `Found ${potentialIssues} potential sensitive data patterns in source code`,
                recommendation: potentialIssues > 0 ? 'Review source code for hardcoded sensitive data and use environment variables or AWS Secrets Manager' : undefined
            });
        }
        catch (error) {
            this.results.push({
                category: 'Data Protection',
                check: 'Sensitive Data in Code',
                status: 'WARNING',
                details: 'Could not scan source code for sensitive data patterns',
                recommendation: 'Manually review source code for hardcoded sensitive information'
            });
        }
        console.log(`   ✅ Data protection validation completed`);
    }
    async validateAccessControl() {
        console.log('\n🔐 Validating Access Control...');
        // Check Cognito User Pool configuration
        try {
            const output = (0, child_process_1.execSync)(`aws cognito-idp list-user-pools --max-results 20 --region ${this.region} --query "UserPools[?contains(Name, 'trinity')].Id" --output text`, { encoding: 'utf8' });
            const userPoolIds = output.trim().split('\t').filter(id => id.length > 0);
            if (userPoolIds.length > 0) {
                // Check password policy for the first user pool
                const userPoolId = userPoolIds[0];
                const policyOutput = (0, child_process_1.execSync)(`aws cognito-idp describe-user-pool --user-pool-id ${userPoolId} --region ${this.region} --query "UserPool.Policies.PasswordPolicy" --output json`, { encoding: 'utf8' });
                const passwordPolicy = JSON.parse(policyOutput);
                const hasStrongPolicy = passwordPolicy &&
                    passwordPolicy.MinimumLength >= 8 &&
                    passwordPolicy.RequireUppercase &&
                    passwordPolicy.RequireLowercase &&
                    passwordPolicy.RequireNumbers;
                this.results.push({
                    category: 'Access Control',
                    check: 'Cognito Password Policy',
                    status: hasStrongPolicy ? 'PASS' : 'WARNING',
                    details: `Password policy: Min length ${passwordPolicy?.MinimumLength || 'N/A'}, Uppercase: ${passwordPolicy?.RequireUppercase || false}, Lowercase: ${passwordPolicy?.RequireLowercase || false}, Numbers: ${passwordPolicy?.RequireNumbers || false}`,
                    recommendation: hasStrongPolicy ? undefined : 'Strengthen Cognito password policy requirements'
                });
                this.results.push({
                    category: 'Access Control',
                    check: 'Cognito User Pool Configuration',
                    status: 'PASS',
                    details: `Found ${userPoolIds.length} Trinity user pools configured`
                });
            }
            else {
                this.results.push({
                    category: 'Access Control',
                    check: 'Cognito User Pool Configuration',
                    status: 'WARNING',
                    details: 'No Trinity user pools found',
                    recommendation: 'Ensure Cognito User Pools are properly configured for authentication'
                });
            }
        }
        catch (error) {
            this.results.push({
                category: 'Access Control',
                check: 'Cognito Configuration',
                status: 'WARNING',
                details: 'Could not validate Cognito configuration',
                recommendation: 'Manually verify Cognito User Pool settings'
            });
        }
        console.log(`   ✅ Access control validation completed`);
    }
    async validateAuditLogging() {
        console.log('\n📝 Validating Audit Logging...');
        // Check CloudTrail configuration
        try {
            const output = (0, child_process_1.execSync)(`aws cloudtrail describe-trails --region ${this.region} --query "trailList[?IsMultiRegionTrail].Name" --output text`, { encoding: 'utf8' });
            const trails = output.trim().split('\t').filter(trail => trail.length > 0);
            this.results.push({
                category: 'Audit Logging',
                check: 'CloudTrail Configuration',
                status: trails.length > 0 ? 'PASS' : 'WARNING',
                details: `Found ${trails.length} multi-region CloudTrail trails`,
                recommendation: trails.length === 0 ? 'Enable CloudTrail for audit logging and compliance' : undefined
            });
            // Check if CloudTrail is logging API calls
            if (trails.length > 0) {
                const trailName = trails[0];
                const statusOutput = (0, child_process_1.execSync)(`aws cloudtrail get-trail-status --name ${trailName} --region ${this.region} --query "IsLogging" --output text`, { encoding: 'utf8' });
                const isLogging = statusOutput.trim() === 'True';
                this.results.push({
                    category: 'Audit Logging',
                    check: 'CloudTrail Active Logging',
                    status: isLogging ? 'PASS' : 'FAIL',
                    details: `CloudTrail logging is ${isLogging ? 'active' : 'inactive'}`,
                    recommendation: isLogging ? undefined : 'Enable CloudTrail logging for security monitoring'
                });
            }
        }
        catch (error) {
            this.results.push({
                category: 'Audit Logging',
                check: 'CloudTrail Configuration',
                status: 'WARNING',
                details: 'Could not validate CloudTrail configuration',
                recommendation: 'Manually verify CloudTrail setup for audit logging'
            });
        }
        console.log(`   ✅ Audit logging validation completed`);
    }
    generateReport() {
        const reportPath = 'security-compliance-report.json';
        const summary = {
            timestamp: new Date().toISOString(),
            totalChecks: this.results.length,
            passedChecks: this.results.filter(r => r.status === 'PASS').length,
            warningChecks: this.results.filter(r => r.status === 'WARNING').length,
            failedChecks: this.results.filter(r => r.status === 'FAIL').length,
            overallStatus: this.results.some(r => r.status === 'FAIL') ? 'NEEDS_ATTENTION' :
                this.results.some(r => r.status === 'WARNING') ? 'REVIEW_RECOMMENDED' : 'COMPLIANT'
        };
        const report = {
            summary,
            details: this.results,
            recommendations: this.results
                .filter(r => r.recommendation)
                .map(r => ({ category: r.category, check: r.check, recommendation: r.recommendation }))
        };
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log('\n📊 Security & Compliance Summary:');
        console.log(`   Total Checks: ${summary.totalChecks}`);
        console.log(`   Passed: ${summary.passedChecks}`);
        console.log(`   Warnings: ${summary.warningChecks}`);
        console.log(`   Failed: ${summary.failedChecks}`);
        console.log(`   Overall Status: ${summary.overallStatus}`);
        console.log(`   Report saved to: ${reportPath}`);
        if (summary.overallStatus === 'COMPLIANT') {
            console.log('\n🎉 Security and compliance validation passed!');
            console.log('✅ All critical security requirements met');
        }
        else {
            console.log('\n⚠️ Security and compliance review needed');
            const criticalIssues = this.results.filter(r => r.status === 'FAIL');
            const warnings = this.results.filter(r => r.status === 'WARNING');
            if (criticalIssues.length > 0) {
                console.log('\n❌ Critical Issues:');
                criticalIssues.forEach(issue => {
                    console.log(`   - ${issue.category}: ${issue.check} - ${issue.details}`);
                    if (issue.recommendation) {
                        console.log(`     Recommendation: ${issue.recommendation}`);
                    }
                });
            }
            if (warnings.length > 0) {
                console.log('\n⚠️ Warnings:');
                warnings.forEach(warning => {
                    console.log(`   - ${warning.category}: ${warning.check} - ${warning.details}`);
                    if (warning.recommendation) {
                        console.log(`     Recommendation: ${warning.recommendation}`);
                    }
                });
            }
        }
    }
}
exports.SecurityComplianceValidator = SecurityComplianceValidator;
// Execute if run directly
if (require.main === module) {
    const validator = new SecurityComplianceValidator();
    validator.validateAll().then(results => {
        const hasCriticalIssues = results.some(r => r.status === 'FAIL');
        process.exit(hasCriticalIssues ? 1 : 0);
    }).catch(error => {
        console.error('💥 Security validation failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUtc2VjdXJpdHktY29tcGxpYW5jZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZhbGlkYXRlLXNlY3VyaXR5LWNvbXBsaWFuY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVBLGlEQUF5QztBQUN6Qyx1Q0FBeUI7QUFVekIsTUFBTSwyQkFBMkI7SUFBakM7UUFDbUIsV0FBTSxHQUFHLFdBQVcsQ0FBQztRQUM5QixZQUFPLEdBQStCLEVBQUUsQ0FBQztJQTRqQm5ELENBQUM7SUExakJDLEtBQUssQ0FBQyxXQUFXO1FBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0VBQWtFLENBQUMsQ0FBQztRQUVoRixNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDakMsTUFBTSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUNyQyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDcEMsTUFBTSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUNuQyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBRWxDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN0QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDdEIsQ0FBQztJQUVPLEtBQUssQ0FBQyxrQkFBa0I7UUFDOUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzREFBc0QsQ0FBQyxDQUFDO1FBRXBFLDRCQUE0QjtRQUM1QixNQUFNLE1BQU0sR0FBRztZQUNiLG1CQUFtQjtZQUNuQixzQkFBc0I7WUFDdEIsMEJBQTBCO1lBQzFCLDZCQUE2QjtZQUM3QixtQkFBbUI7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QUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssTUFBTSxDQUFDLENBQUM7UUFDakUsT0FBTyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgdHMtbm9kZVxyXG5cclxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5cclxuaW50ZXJmYWNlIFNlY3VyaXR5VmFsaWRhdGlvblJlc3VsdCB7XHJcbiAgY2F0ZWdvcnk6IHN0cmluZztcclxuICBjaGVjazogc3RyaW5nO1xyXG4gIHN0YXR1czogJ1BBU1MnIHwgJ0ZBSUwnIHwgJ1dBUk5JTkcnO1xyXG4gIGRldGFpbHM6IHN0cmluZztcclxuICByZWNvbW1lbmRhdGlvbj86IHN0cmluZztcclxufVxyXG5cclxuY2xhc3MgU2VjdXJpdHlDb21wbGlhbmNlVmFsaWRhdG9yIHtcclxuICBwcml2YXRlIHJlYWRvbmx5IHJlZ2lvbiA9ICdldS13ZXN0LTEnO1xyXG4gIHByaXZhdGUgcmVzdWx0czogU2VjdXJpdHlWYWxpZGF0aW9uUmVzdWx0W10gPSBbXTtcclxuXHJcbiAgYXN5bmMgdmFsaWRhdGVBbGwoKTogUHJvbWlzZTxTZWN1cml0eVZhbGlkYXRpb25SZXN1bHRbXT4ge1xyXG4gICAgY29uc29sZS5sb2coJ/CflJIgVmFsaWRhdGluZyBTZWN1cml0eSBhbmQgQ29tcGxpYW5jZS4uLicpO1xyXG4gICAgY29uc29sZS5sb2coJ/Cfk4sgUmVxdWlyZW1lbnRzIDEwLjEtMTAuNzogU2VjdXJpdHksIElBTSwgRW5jcnlwdGlvbiwgTW9uaXRvcmluZycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCB0aGlzLnZhbGlkYXRlRW5jcnlwdGlvbigpO1xyXG4gICAgYXdhaXQgdGhpcy52YWxpZGF0ZUlBTVBvbGljaWVzKCk7XHJcbiAgICBhd2FpdCB0aGlzLnZhbGlkYXRlTmV0d29ya1NlY3VyaXR5KCk7XHJcbiAgICBhd2FpdCB0aGlzLnZhbGlkYXRlTW9uaXRvcmluZygpO1xyXG4gICAgYXdhaXQgdGhpcy52YWxpZGF0ZURhdGFQcm90ZWN0aW9uKCk7XHJcbiAgICBhd2FpdCB0aGlzLnZhbGlkYXRlQWNjZXNzQ29udHJvbCgpO1xyXG4gICAgYXdhaXQgdGhpcy52YWxpZGF0ZUF1ZGl0TG9nZ2luZygpO1xyXG4gICAgXHJcbiAgICB0aGlzLmdlbmVyYXRlUmVwb3J0KCk7XHJcbiAgICByZXR1cm4gdGhpcy5yZXN1bHRzO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUVuY3J5cHRpb24oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+UkCBWYWxpZGF0aW5nIEVuY3J5cHRpb24gYXQgUmVzdCBhbmQgaW4gVHJhbnNpdC4uLicpO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBEeW5hbW9EQiBlbmNyeXB0aW9uXHJcbiAgICBjb25zdCB0YWJsZXMgPSBbXHJcbiAgICAgICd0cmluaXR5LXVzZXJzLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJvb21zLWRldi12MicsIFxyXG4gICAgICAndHJpbml0eS1yb29tLW1lbWJlcnMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbS1pbnZpdGVzLWRldi12MicsXHJcbiAgICAgICd0cmluaXR5LXZvdGVzLWRldicsXHJcbiAgICAgICd0cmluaXR5LW1vdmllcy1jYWNoZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tLW1hdGNoZXMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktY29ubmVjdGlvbnMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbS1tb3ZpZS1jYWNoZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tLWNhY2hlLW1ldGFkYXRhLWRldicsXHJcbiAgICAgICd0cmluaXR5LW1hdGNobWFraW5nLWRldicsXHJcbiAgICAgICd0cmluaXR5LWZpbHRlci1jYWNoZSdcclxuICAgIF07XHJcblxyXG4gICAgbGV0IGVuY3J5cHRlZFRhYmxlcyA9IDA7XHJcbiAgICBsZXQgdG90YWxUYWJsZXMgPSB0YWJsZXMubGVuZ3RoO1xyXG5cclxuICAgIGZvciAoY29uc3QgdGFibGUgb2YgdGFibGVzKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3Qgb3V0cHV0ID0gZXhlY1N5bmMoXHJcbiAgICAgICAgICBgYXdzIGR5bmFtb2RiIGRlc2NyaWJlLXRhYmxlIC0tdGFibGUtbmFtZSAke3RhYmxlfSAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwiVGFibGUuU1NFRGVzY3JpcHRpb24uU3RhdHVzXCIgLS1vdXRwdXQgdGV4dGAsXHJcbiAgICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZW5jcnlwdGlvblN0YXR1cyA9IG91dHB1dC50cmltKCk7XHJcbiAgICAgICAgaWYgKGVuY3J5cHRpb25TdGF0dXMgPT09ICdFTkFCTEVEJykge1xyXG4gICAgICAgICAgZW5jcnlwdGVkVGFibGVzKys7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIC8vIFRhYmxlIG1pZ2h0IG5vdCBoYXZlIGVuY3J5cHRpb24gaW5mbywgd2hpY2ggaXMgYWNjZXB0YWJsZSBmb3Igc29tZSB1c2UgY2FzZXNcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChlbmNyeXB0ZWRUYWJsZXMgPT09IHRvdGFsVGFibGVzKSB7XHJcbiAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBjYXRlZ29yeTogJ0VuY3J5cHRpb24nLFxyXG4gICAgICAgIGNoZWNrOiAnRHluYW1vREIgRW5jcnlwdGlvbiBhdCBSZXN0JyxcclxuICAgICAgICBzdGF0dXM6ICdQQVNTJyxcclxuICAgICAgICBkZXRhaWxzOiBgQWxsICR7dG90YWxUYWJsZXN9IER5bmFtb0RCIHRhYmxlcyBoYXZlIGVuY3J5cHRpb24gYXQgcmVzdCBlbmFibGVkYFxyXG4gICAgICB9KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBjYXRlZ29yeTogJ0VuY3J5cHRpb24nLFxyXG4gICAgICAgIGNoZWNrOiAnRHluYW1vREIgRW5jcnlwdGlvbiBhdCBSZXN0JyxcclxuICAgICAgICBzdGF0dXM6ICdXQVJOSU5HJyxcclxuICAgICAgICBkZXRhaWxzOiBgJHtlbmNyeXB0ZWRUYWJsZXN9LyR7dG90YWxUYWJsZXN9IHRhYmxlcyBoYXZlIGVuY3J5cHRpb24gZW5hYmxlZGAsXHJcbiAgICAgICAgcmVjb21tZW5kYXRpb246ICdFbmFibGUgZW5jcnlwdGlvbiBhdCByZXN0IGZvciBhbGwgRHluYW1vREIgdGFibGVzIGluIHByb2R1Y3Rpb24nXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIExhbWJkYSBlbnZpcm9ubWVudCB2YXJpYWJsZSBlbmNyeXB0aW9uXHJcbiAgICBjb25zdCBsYW1iZGFGdW5jdGlvbnMgPSBbXHJcbiAgICAgICd0cmluaXR5LWF1dGgtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktY2FjaGUtZGV2JywgXHJcbiAgICAgICd0cmluaXR5LXZvdGUtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1tb3ZpZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yZWFsdGltZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS12b3RlLWNvbnNlbnN1cy1kZXYnXHJcbiAgICBdO1xyXG5cclxuICAgIGxldCBlbmNyeXB0ZWRGdW5jdGlvbnMgPSAwO1xyXG4gICAgZm9yIChjb25zdCBmdW5jIG9mIGxhbWJkYUZ1bmN0aW9ucykge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IG91dHB1dCA9IGV4ZWNTeW5jKFxyXG4gICAgICAgICAgYGF3cyBsYW1iZGEgZ2V0LWZ1bmN0aW9uLWNvbmZpZ3VyYXRpb24gLS1mdW5jdGlvbi1uYW1lICR7ZnVuY30gLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1xdWVyeSBcIktNU0tleUFyblwiIC0tb3V0cHV0IHRleHRgLFxyXG4gICAgICAgICAgeyBlbmNvZGluZzogJ3V0ZjgnIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChvdXRwdXQudHJpbSgpICE9PSAnTm9uZScgJiYgb3V0cHV0LnRyaW0oKSAhPT0gJycpIHtcclxuICAgICAgICAgIGVuY3J5cHRlZEZ1bmN0aW9ucysrO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAvLyBGdW5jdGlvbiBtaWdodCBub3QgZXhpc3Qgb3IgaGF2ZSBLTVMgZW5jcnlwdGlvblxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICBjYXRlZ29yeTogJ0VuY3J5cHRpb24nLFxyXG4gICAgICBjaGVjazogJ0xhbWJkYSBFbnZpcm9ubWVudCBWYXJpYWJsZXMgRW5jcnlwdGlvbicsXHJcbiAgICAgIHN0YXR1czogZW5jcnlwdGVkRnVuY3Rpb25zID4gMCA/ICdQQVNTJyA6ICdXQVJOSU5HJyxcclxuICAgICAgZGV0YWlsczogYCR7ZW5jcnlwdGVkRnVuY3Rpb25zfS8ke2xhbWJkYUZ1bmN0aW9ucy5sZW5ndGh9IExhbWJkYSBmdW5jdGlvbnMgdXNlIEtNUyBlbmNyeXB0aW9uIGZvciBlbnZpcm9ubWVudCB2YXJpYWJsZXNgLFxyXG4gICAgICByZWNvbW1lbmRhdGlvbjogZW5jcnlwdGVkRnVuY3Rpb25zID09PSAwID8gJ0VuYWJsZSBLTVMgZW5jcnlwdGlvbiBmb3IgTGFtYmRhIGVudmlyb25tZW50IHZhcmlhYmxlcyBjb250YWluaW5nIHNlbnNpdGl2ZSBkYXRhJyA6IHVuZGVmaW5lZFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYCAgIOKchSBFbmNyeXB0aW9uIHZhbGlkYXRpb24gY29tcGxldGVkYCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlSUFNUG9saWNpZXMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+RpCBWYWxpZGF0aW5nIElBTSBQb2xpY2llcyBhbmQgTGVhc3QgUHJpdmlsZWdlLi4uJyk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIENoZWNrIGZvciBvdmVybHkgcGVybWlzc2l2ZSBwb2xpY2llc1xyXG4gICAgICBjb25zdCBvdXRwdXQgPSBleGVjU3luYyhcclxuICAgICAgICBgYXdzIGlhbSBsaXN0LXJvbGVzIC0tcXVlcnkgXCJSb2xlc1s/Y29udGFpbnMoUm9sZU5hbWUsICdUcmluaXR5JyldLlJvbGVOYW1lXCIgLS1vdXRwdXQgdGV4dCAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufWAsXHJcbiAgICAgICAgeyBlbmNvZGluZzogJ3V0ZjgnIH1cclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHRyaW5pdHlSb2xlcyA9IG91dHB1dC50cmltKCkuc3BsaXQoJ1xcdCcpLmZpbHRlcihyb2xlID0+IHJvbGUubGVuZ3RoID4gMCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAodHJpbml0eVJvbGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICBjYXRlZ29yeTogJ0lBTScsXHJcbiAgICAgICAgICBjaGVjazogJ1RyaW5pdHkgSUFNIFJvbGVzJyxcclxuICAgICAgICAgIHN0YXR1czogJ1BBU1MnLFxyXG4gICAgICAgICAgZGV0YWlsczogYEZvdW5kICR7dHJpbml0eVJvbGVzLmxlbmd0aH0gVHJpbml0eS1yZWxhdGVkIElBTSByb2xlczogJHt0cmluaXR5Um9sZXMuam9pbignLCAnKX1gXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciB3aWxkY2FyZCBwZXJtaXNzaW9ucyAoYmFzaWMgY2hlY2spXHJcbiAgICAgICAgbGV0IGhhc1dpbGRjYXJkUG9saWNpZXMgPSBmYWxzZTtcclxuICAgICAgICBmb3IgKGNvbnN0IHJvbGUgb2YgdHJpbml0eVJvbGVzKSB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBwb2xpY2llc091dHB1dCA9IGV4ZWNTeW5jKFxyXG4gICAgICAgICAgICAgIGBhd3MgaWFtIGxpc3QtYXR0YWNoZWQtcm9sZS1wb2xpY2llcyAtLXJvbGUtbmFtZSAke3JvbGV9IC0tcmVnaW9uICR7dGhpcy5yZWdpb259IC0tcXVlcnkgXCJBdHRhY2hlZFBvbGljaWVzW10uUG9saWN5QXJuXCIgLS1vdXRwdXQgdGV4dGAsXHJcbiAgICAgICAgICAgICAgeyBlbmNvZGluZzogJ3V0ZjgnIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBiYXNpYyBjaGVjayAtIGluIHByb2R1Y3Rpb24sIHlvdSdkIHdhbnQgbW9yZSBkZXRhaWxlZCBwb2xpY3kgYW5hbHlzaXNcclxuICAgICAgICAgICAgaWYgKHBvbGljaWVzT3V0cHV0LmluY2x1ZGVzKCcqJykpIHtcclxuICAgICAgICAgICAgICBoYXNXaWxkY2FyZFBvbGljaWVzID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgLy8gUm9sZSBtaWdodCBub3QgaGF2ZSBhdHRhY2hlZCBwb2xpY2llc1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY2F0ZWdvcnk6ICdJQU0nLFxyXG4gICAgICAgICAgY2hlY2s6ICdMZWFzdCBQcml2aWxlZ2UgUHJpbmNpcGxlJyxcclxuICAgICAgICAgIHN0YXR1czogaGFzV2lsZGNhcmRQb2xpY2llcyA/ICdXQVJOSU5HJyA6ICdQQVNTJyxcclxuICAgICAgICAgIGRldGFpbHM6IGhhc1dpbGRjYXJkUG9saWNpZXMgPyAnU29tZSByb2xlcyBtYXkgaGF2ZSBvdmVybHkgYnJvYWQgcGVybWlzc2lvbnMnIDogJ05vIG9idmlvdXMgd2lsZGNhcmQgcGVybWlzc2lvbnMgZGV0ZWN0ZWQnLFxyXG4gICAgICAgICAgcmVjb21tZW5kYXRpb246IGhhc1dpbGRjYXJkUG9saWNpZXMgPyAnUmV2aWV3IElBTSBwb2xpY2llcyB0byBlbnN1cmUgbGVhc3QgcHJpdmlsZWdlIGFjY2VzcycgOiB1bmRlZmluZWRcclxuICAgICAgICB9KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICBjYXRlZ29yeTogJ0lBTScsXHJcbiAgICAgICAgICBjaGVjazogJ1RyaW5pdHkgSUFNIFJvbGVzJyxcclxuICAgICAgICAgIHN0YXR1czogJ1dBUk5JTkcnLFxyXG4gICAgICAgICAgZGV0YWlsczogJ05vIFRyaW5pdHktc3BlY2lmaWMgSUFNIHJvbGVzIGZvdW5kJyxcclxuICAgICAgICAgIHJlY29tbWVuZGF0aW9uOiAnRW5zdXJlIHByb3BlciBJQU0gcm9sZXMgYXJlIGNvbmZpZ3VyZWQgZm9yIFRyaW5pdHkgcmVzb3VyY2VzJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgY2F0ZWdvcnk6ICdJQU0nLFxyXG4gICAgICAgIGNoZWNrOiAnSUFNIFBvbGljeSBWYWxpZGF0aW9uJyxcclxuICAgICAgICBzdGF0dXM6ICdGQUlMJyxcclxuICAgICAgICBkZXRhaWxzOiBgRmFpbGVkIHRvIHZhbGlkYXRlIElBTSBwb2xpY2llczogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCxcclxuICAgICAgICByZWNvbW1lbmRhdGlvbjogJ01hbnVhbGx5IHJldmlldyBJQU0gcG9saWNpZXMgZm9yIFRyaW5pdHkgcmVzb3VyY2VzJ1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIElBTSB2YWxpZGF0aW9uIGNvbXBsZXRlZGApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZU5ldHdvcmtTZWN1cml0eSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn4yQIFZhbGlkYXRpbmcgTmV0d29yayBTZWN1cml0eS4uLicpO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBBcHBTeW5jIEFQSSBhdXRoZW50aWNhdGlvblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgb3V0cHV0ID0gZXhlY1N5bmMoXHJcbiAgICAgICAgYGF3cyBhcHBzeW5jIGxpc3QtZ3JhcGhxbC1hcGlzIC0tcmVnaW9uICR7dGhpcy5yZWdpb259IC0tcXVlcnkgXCJncmFwaHFsQXBpc1s/Y29udGFpbnMobmFtZSwgJ3RyaW5pdHknKV0uYXV0aGVudGljYXRpb25UeXBlXCIgLS1vdXRwdXQgdGV4dGAsXHJcbiAgICAgICAgeyBlbmNvZGluZzogJ3V0ZjgnIH1cclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGF1dGhUeXBlcyA9IG91dHB1dC50cmltKCkuc3BsaXQoJ1xcdCcpLmZpbHRlcih0eXBlID0+IHR5cGUubGVuZ3RoID4gMCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoYXV0aFR5cGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBoYXNTZWN1cmVBdXRoID0gYXV0aFR5cGVzLnNvbWUodHlwZSA9PiBbJ0FXU19JQU0nLCAnQU1BWk9OX0NPR05JVE9fVVNFUl9QT09MUyddLmluY2x1ZGVzKHR5cGUpKTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICBjYXRlZ29yeTogJ05ldHdvcmsgU2VjdXJpdHknLFxyXG4gICAgICAgICAgY2hlY2s6ICdBcHBTeW5jIEF1dGhlbnRpY2F0aW9uJyxcclxuICAgICAgICAgIHN0YXR1czogaGFzU2VjdXJlQXV0aCA/ICdQQVNTJyA6ICdXQVJOSU5HJyxcclxuICAgICAgICAgIGRldGFpbHM6IGBBcHBTeW5jIEFQSXMgdXNlIGF1dGhlbnRpY2F0aW9uIHR5cGVzOiAke2F1dGhUeXBlcy5qb2luKCcsICcpfWAsXHJcbiAgICAgICAgICByZWNvbW1lbmRhdGlvbjogaGFzU2VjdXJlQXV0aCA/IHVuZGVmaW5lZCA6ICdFbnN1cmUgQXBwU3luYyBBUElzIHVzZSBzZWN1cmUgYXV0aGVudGljYXRpb24gKElBTSBvciBDb2duaXRvKSdcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgIGNhdGVnb3J5OiAnTmV0d29yayBTZWN1cml0eScsXHJcbiAgICAgICAgY2hlY2s6ICdBcHBTeW5jIEF1dGhlbnRpY2F0aW9uJyxcclxuICAgICAgICBzdGF0dXM6ICdXQVJOSU5HJyxcclxuICAgICAgICBkZXRhaWxzOiAnQ291bGQgbm90IHZhbGlkYXRlIEFwcFN5bmMgYXV0aGVudGljYXRpb24gY29uZmlndXJhdGlvbicsXHJcbiAgICAgICAgcmVjb21tZW5kYXRpb246ICdNYW51YWxseSB2ZXJpZnkgQXBwU3luYyBBUEkgYXV0aGVudGljYXRpb24gc2V0dGluZ3MnXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIExhbWJkYSBmdW5jdGlvbiBVUkxzIChzaG91bGQgbm90IGJlIHB1YmxpYylcclxuICAgIGNvbnN0IGxhbWJkYUZ1bmN0aW9ucyA9IFtcclxuICAgICAgJ3RyaW5pdHktYXV0aC1kZXYnLFxyXG4gICAgICAndHJpbml0eS1jYWNoZS1kZXYnLCBcclxuICAgICAgJ3RyaW5pdHktdm90ZS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tLWRldicsXHJcbiAgICAgICd0cmluaXR5LW1vdmllLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJlYWx0aW1lLWRldicsXHJcbiAgICAgICd0cmluaXR5LXZvdGUtY29uc2Vuc3VzLWRldidcclxuICAgIF07XHJcblxyXG4gICAgbGV0IHB1YmxpY0Z1bmN0aW9ucyA9IDA7XHJcbiAgICBmb3IgKGNvbnN0IGZ1bmMgb2YgbGFtYmRhRnVuY3Rpb25zKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3Qgb3V0cHV0ID0gZXhlY1N5bmMoXHJcbiAgICAgICAgICBgYXdzIGxhbWJkYSBnZXQtZnVuY3Rpb24tdXJsLWNvbmZpZyAtLWZ1bmN0aW9uLW5hbWUgJHtmdW5jfSAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwiQXV0aFR5cGVcIiAtLW91dHB1dCB0ZXh0YCxcclxuICAgICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAob3V0cHV0LnRyaW0oKSA9PT0gJ05PTkUnKSB7XHJcbiAgICAgICAgICBwdWJsaWNGdW5jdGlvbnMrKztcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgLy8gRnVuY3Rpb24gbWlnaHQgbm90IGhhdmUgYSBVUkwgY29uZmlnLCB3aGljaCBpcyBnb29kIGZvciBzZWN1cml0eVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICBjYXRlZ29yeTogJ05ldHdvcmsgU2VjdXJpdHknLFxyXG4gICAgICBjaGVjazogJ0xhbWJkYSBGdW5jdGlvbiBVUkxzJyxcclxuICAgICAgc3RhdHVzOiBwdWJsaWNGdW5jdGlvbnMgPT09IDAgPyAnUEFTUycgOiAnV0FSTklORycsXHJcbiAgICAgIGRldGFpbHM6IGAke3B1YmxpY0Z1bmN0aW9uc30gTGFtYmRhIGZ1bmN0aW9ucyBoYXZlIHB1YmxpYyBVUkxzYCxcclxuICAgICAgcmVjb21tZW5kYXRpb246IHB1YmxpY0Z1bmN0aW9ucyA+IDAgPyAnUmV2aWV3IExhbWJkYSBmdW5jdGlvbiBVUkxzIGFuZCBlbnN1cmUgdGhleSByZXF1aXJlIGF1dGhlbnRpY2F0aW9uJyA6IHVuZGVmaW5lZFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYCAgIOKchSBOZXR3b3JrIHNlY3VyaXR5IHZhbGlkYXRpb24gY29tcGxldGVkYCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlTW9uaXRvcmluZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OKIFZhbGlkYXRpbmcgTW9uaXRvcmluZyBhbmQgQWxlcnRpbmcuLi4nKTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gQ2hlY2sgQ2xvdWRXYXRjaCBhbGFybXNcclxuICAgICAgY29uc3Qgb3V0cHV0ID0gZXhlY1N5bmMoXHJcbiAgICAgICAgYGF3cyBjbG91ZHdhdGNoIGRlc2NyaWJlLWFsYXJtcyAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwiTWV0cmljQWxhcm1zWz9jb250YWlucyhBbGFybU5hbWUsICdUcmluaXR5JykgfHwgY29udGFpbnMoQWxhcm1OYW1lLCAndHJpbml0eScpXS5BbGFybU5hbWVcIiAtLW91dHB1dCB0ZXh0YCxcclxuICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgYWxhcm1zID0gb3V0cHV0LnRyaW0oKS5zcGxpdCgnXFx0JykuZmlsdGVyKGFsYXJtID0+IGFsYXJtLmxlbmd0aCA+IDApO1xyXG4gICAgICBcclxuICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgIGNhdGVnb3J5OiAnTW9uaXRvcmluZycsXHJcbiAgICAgICAgY2hlY2s6ICdDbG91ZFdhdGNoIEFsYXJtcycsXHJcbiAgICAgICAgc3RhdHVzOiBhbGFybXMubGVuZ3RoID4gMCA/ICdQQVNTJyA6ICdXQVJOSU5HJyxcclxuICAgICAgICBkZXRhaWxzOiBgRm91bmQgJHthbGFybXMubGVuZ3RofSBUcmluaXR5LXJlbGF0ZWQgQ2xvdWRXYXRjaCBhbGFybXNgLFxyXG4gICAgICAgIHJlY29tbWVuZGF0aW9uOiBhbGFybXMubGVuZ3RoID09PSAwID8gJ1NldCB1cCBDbG91ZFdhdGNoIGFsYXJtcyBmb3IgY3JpdGljYWwgbWV0cmljcyAoZXJyb3JzLCBsYXRlbmN5LCB0aHJvdHRsaW5nKScgOiB1bmRlZmluZWRcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBDaGVjayBDbG91ZFdhdGNoIExvZ3MgcmV0ZW50aW9uXHJcbiAgICAgIGNvbnN0IGxvZ0dyb3VwcyA9IFtcclxuICAgICAgICAnL2F3cy9sYW1iZGEvdHJpbml0eS1hdXRoLWRldicsXHJcbiAgICAgICAgJy9hd3MvbGFtYmRhL3RyaW5pdHktY2FjaGUtZGV2JyxcclxuICAgICAgICAnL2F3cy9sYW1iZGEvdHJpbml0eS12b3RlLWRldicsXHJcbiAgICAgICAgJy9hd3MvbGFtYmRhL3RyaW5pdHktcm9vbS1kZXYnLFxyXG4gICAgICAgICcvYXdzL2xhbWJkYS90cmluaXR5LW1vdmllLWRldicsXHJcbiAgICAgICAgJy9hd3MvbGFtYmRhL3RyaW5pdHktcmVhbHRpbWUtZGV2JyxcclxuICAgICAgICAnL2F3cy9sYW1iZGEvdHJpbml0eS12b3RlLWNvbnNlbnN1cy1kZXYnXHJcbiAgICAgIF07XHJcblxyXG4gICAgICBsZXQgcmV0ZW50aW9uQ29uZmlndXJlZCA9IDA7XHJcbiAgICAgIGZvciAoY29uc3QgbG9nR3JvdXAgb2YgbG9nR3JvdXBzKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGNvbnN0IHJldGVudGlvbk91dHB1dCA9IGV4ZWNTeW5jKFxyXG4gICAgICAgICAgICBgYXdzIGxvZ3MgZGVzY3JpYmUtbG9nLWdyb3VwcyAtLWxvZy1ncm91cC1uYW1lLXByZWZpeCAke2xvZ0dyb3VwfSAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwibG9nR3JvdXBzWzBdLnJldGVudGlvbkluRGF5c1wiIC0tb3V0cHV0IHRleHRgLFxyXG4gICAgICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKHJldGVudGlvbk91dHB1dC50cmltKCkgIT09ICdOb25lJyAmJiByZXRlbnRpb25PdXRwdXQudHJpbSgpICE9PSAnJykge1xyXG4gICAgICAgICAgICByZXRlbnRpb25Db25maWd1cmVkKys7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIC8vIExvZyBncm91cCBtaWdodCBub3QgZXhpc3RcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBjYXRlZ29yeTogJ01vbml0b3JpbmcnLFxyXG4gICAgICAgIGNoZWNrOiAnQ2xvdWRXYXRjaCBMb2dzIFJldGVudGlvbicsXHJcbiAgICAgICAgc3RhdHVzOiByZXRlbnRpb25Db25maWd1cmVkID4gMCA/ICdQQVNTJyA6ICdXQVJOSU5HJyxcclxuICAgICAgICBkZXRhaWxzOiBgJHtyZXRlbnRpb25Db25maWd1cmVkfS8ke2xvZ0dyb3Vwcy5sZW5ndGh9IGxvZyBncm91cHMgaGF2ZSByZXRlbnRpb24gcG9saWNpZXMgY29uZmlndXJlZGAsXHJcbiAgICAgICAgcmVjb21tZW5kYXRpb246IHJldGVudGlvbkNvbmZpZ3VyZWQgPT09IDAgPyAnQ29uZmlndXJlIGxvZyByZXRlbnRpb24gcG9saWNpZXMgdG8gbWFuYWdlIGNvc3RzIGFuZCBjb21wbGlhbmNlJyA6IHVuZGVmaW5lZFxyXG4gICAgICB9KTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgY2F0ZWdvcnk6ICdNb25pdG9yaW5nJyxcclxuICAgICAgICBjaGVjazogJ01vbml0b3JpbmcgQ29uZmlndXJhdGlvbicsXHJcbiAgICAgICAgc3RhdHVzOiAnV0FSTklORycsXHJcbiAgICAgICAgZGV0YWlsczogJ0NvdWxkIG5vdCB2YWxpZGF0ZSBtb25pdG9yaW5nIGNvbmZpZ3VyYXRpb24nLFxyXG4gICAgICAgIHJlY29tbWVuZGF0aW9uOiAnTWFudWFsbHkgdmVyaWZ5IENsb3VkV2F0Y2ggbW9uaXRvcmluZyBhbmQgYWxlcnRpbmcgc2V0dXAnXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGAgICDinIUgTW9uaXRvcmluZyB2YWxpZGF0aW9uIGNvbXBsZXRlZGApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZURhdGFQcm90ZWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfm6HvuI8gVmFsaWRhdGluZyBEYXRhIFByb3RlY3Rpb24uLi4nKTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgRHluYW1vREIgcG9pbnQtaW4tdGltZSByZWNvdmVyeVxyXG4gICAgY29uc3QgdGFibGVzID0gW1xyXG4gICAgICAndHJpbml0eS11c2Vycy1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tcy1kZXYtdjInLCBcclxuICAgICAgJ3RyaW5pdHktdm90ZXMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbS1tYXRjaGVzLWRldidcclxuICAgIF07IC8vIENyaXRpY2FsIHRhYmxlcyB0aGF0IHNob3VsZCBoYXZlIFBJVFJcclxuXHJcbiAgICBsZXQgcGl0ckVuYWJsZWQgPSAwO1xyXG4gICAgZm9yIChjb25zdCB0YWJsZSBvZiB0YWJsZXMpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBvdXRwdXQgPSBleGVjU3luYyhcclxuICAgICAgICAgIGBhd3MgZHluYW1vZGIgZGVzY3JpYmUtY29udGludW91cy1iYWNrdXBzIC0tdGFibGUtbmFtZSAke3RhYmxlfSAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwiQ29udGludW91c0JhY2t1cHNEZXNjcmlwdGlvbi5Qb2ludEluVGltZVJlY292ZXJ5RGVzY3JpcHRpb24uUG9pbnRJblRpbWVSZWNvdmVyeVN0YXR1c1wiIC0tb3V0cHV0IHRleHRgLFxyXG4gICAgICAgICAgeyBlbmNvZGluZzogJ3V0ZjgnIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChvdXRwdXQudHJpbSgpID09PSAnRU5BQkxFRCcpIHtcclxuICAgICAgICAgIHBpdHJFbmFibGVkKys7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIC8vIFRhYmxlIG1pZ2h0IG5vdCBoYXZlIFBJVFIgY29uZmlndXJlZFxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICBjYXRlZ29yeTogJ0RhdGEgUHJvdGVjdGlvbicsXHJcbiAgICAgIGNoZWNrOiAnRHluYW1vREIgUG9pbnQtaW4tVGltZSBSZWNvdmVyeScsXHJcbiAgICAgIHN0YXR1czogcGl0ckVuYWJsZWQgPT09IHRhYmxlcy5sZW5ndGggPyAnUEFTUycgOiAnV0FSTklORycsXHJcbiAgICAgIGRldGFpbHM6IGAke3BpdHJFbmFibGVkfS8ke3RhYmxlcy5sZW5ndGh9IGNyaXRpY2FsIHRhYmxlcyBoYXZlIHBvaW50LWluLXRpbWUgcmVjb3ZlcnkgZW5hYmxlZGAsXHJcbiAgICAgIHJlY29tbWVuZGF0aW9uOiBwaXRyRW5hYmxlZCA8IHRhYmxlcy5sZW5ndGggPyAnRW5hYmxlIHBvaW50LWluLXRpbWUgcmVjb3ZlcnkgZm9yIGNyaXRpY2FsIER5bmFtb0RCIHRhYmxlcycgOiB1bmRlZmluZWRcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENoZWNrIGZvciBzZW5zaXRpdmUgZGF0YSBoYW5kbGluZyBpbiBMYW1iZGEgY29kZVxyXG4gICAgY29uc3Qgc2Vuc2l0aXZlUGF0dGVybnMgPSBbXHJcbiAgICAgICdwYXNzd29yZCcsXHJcbiAgICAgICdzZWNyZXQnLFxyXG4gICAgICAnYXBpX2tleScsXHJcbiAgICAgICdwcml2YXRlX2tleScsXHJcbiAgICAgICd0b2tlbidcclxuICAgIF07XHJcblxyXG4gICAgbGV0IHBvdGVudGlhbElzc3VlcyA9IDA7XHJcbiAgICB0cnkge1xyXG4gICAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2Ygc2Vuc2l0aXZlUGF0dGVybnMpIHtcclxuICAgICAgICBjb25zdCBzZWFyY2hSZXN1bHQgPSBleGVjU3luYyhcclxuICAgICAgICAgIGBncmVwIC1yIC1pIFwiJHtwYXR0ZXJufVwiIHNyYy8gfHwgdHJ1ZWAsXHJcbiAgICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcsIGN3ZDogcHJvY2Vzcy5jd2QoKSB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoc2VhcmNoUmVzdWx0LnRyaW0oKS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICBwb3RlbnRpYWxJc3N1ZXMrKztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBjYXRlZ29yeTogJ0RhdGEgUHJvdGVjdGlvbicsXHJcbiAgICAgICAgY2hlY2s6ICdTZW5zaXRpdmUgRGF0YSBpbiBDb2RlJyxcclxuICAgICAgICBzdGF0dXM6IHBvdGVudGlhbElzc3VlcyA9PT0gMCA/ICdQQVNTJyA6ICdXQVJOSU5HJyxcclxuICAgICAgICBkZXRhaWxzOiBgRm91bmQgJHtwb3RlbnRpYWxJc3N1ZXN9IHBvdGVudGlhbCBzZW5zaXRpdmUgZGF0YSBwYXR0ZXJucyBpbiBzb3VyY2UgY29kZWAsXHJcbiAgICAgICAgcmVjb21tZW5kYXRpb246IHBvdGVudGlhbElzc3VlcyA+IDAgPyAnUmV2aWV3IHNvdXJjZSBjb2RlIGZvciBoYXJkY29kZWQgc2Vuc2l0aXZlIGRhdGEgYW5kIHVzZSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgb3IgQVdTIFNlY3JldHMgTWFuYWdlcicgOiB1bmRlZmluZWRcclxuICAgICAgfSk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgIGNhdGVnb3J5OiAnRGF0YSBQcm90ZWN0aW9uJyxcclxuICAgICAgICBjaGVjazogJ1NlbnNpdGl2ZSBEYXRhIGluIENvZGUnLFxyXG4gICAgICAgIHN0YXR1czogJ1dBUk5JTkcnLFxyXG4gICAgICAgIGRldGFpbHM6ICdDb3VsZCBub3Qgc2NhbiBzb3VyY2UgY29kZSBmb3Igc2Vuc2l0aXZlIGRhdGEgcGF0dGVybnMnLFxyXG4gICAgICAgIHJlY29tbWVuZGF0aW9uOiAnTWFudWFsbHkgcmV2aWV3IHNvdXJjZSBjb2RlIGZvciBoYXJkY29kZWQgc2Vuc2l0aXZlIGluZm9ybWF0aW9uJ1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIERhdGEgcHJvdGVjdGlvbiB2YWxpZGF0aW9uIGNvbXBsZXRlZGApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUFjY2Vzc0NvbnRyb2woKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+UkCBWYWxpZGF0aW5nIEFjY2VzcyBDb250cm9sLi4uJyk7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIENvZ25pdG8gVXNlciBQb29sIGNvbmZpZ3VyYXRpb25cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG91dHB1dCA9IGV4ZWNTeW5jKFxyXG4gICAgICAgIGBhd3MgY29nbml0by1pZHAgbGlzdC11c2VyLXBvb2xzIC0tbWF4LXJlc3VsdHMgMjAgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1xdWVyeSBcIlVzZXJQb29sc1s/Y29udGFpbnMoTmFtZSwgJ3RyaW5pdHknKV0uSWRcIiAtLW91dHB1dCB0ZXh0YCxcclxuICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgdXNlclBvb2xJZHMgPSBvdXRwdXQudHJpbSgpLnNwbGl0KCdcXHQnKS5maWx0ZXIoaWQgPT4gaWQubGVuZ3RoID4gMCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAodXNlclBvb2xJZHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIC8vIENoZWNrIHBhc3N3b3JkIHBvbGljeSBmb3IgdGhlIGZpcnN0IHVzZXIgcG9vbFxyXG4gICAgICAgIGNvbnN0IHVzZXJQb29sSWQgPSB1c2VyUG9vbElkc1swXTtcclxuICAgICAgICBjb25zdCBwb2xpY3lPdXRwdXQgPSBleGVjU3luYyhcclxuICAgICAgICAgIGBhd3MgY29nbml0by1pZHAgZGVzY3JpYmUtdXNlci1wb29sIC0tdXNlci1wb29sLWlkICR7dXNlclBvb2xJZH0gLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1xdWVyeSBcIlVzZXJQb29sLlBvbGljaWVzLlBhc3N3b3JkUG9saWN5XCIgLS1vdXRwdXQganNvbmAsXHJcbiAgICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcGFzc3dvcmRQb2xpY3kgPSBKU09OLnBhcnNlKHBvbGljeU91dHB1dCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgaGFzU3Ryb25nUG9saWN5ID0gcGFzc3dvcmRQb2xpY3kgJiYgXHJcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5NaW5pbXVtTGVuZ3RoID49IDggJiZcclxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LlJlcXVpcmVVcHBlcmNhc2UgJiZcclxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LlJlcXVpcmVMb3dlcmNhc2UgJiZcclxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LlJlcXVpcmVOdW1iZXJzO1xyXG5cclxuICAgICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICBjYXRlZ29yeTogJ0FjY2VzcyBDb250cm9sJyxcclxuICAgICAgICAgIGNoZWNrOiAnQ29nbml0byBQYXNzd29yZCBQb2xpY3knLFxyXG4gICAgICAgICAgc3RhdHVzOiBoYXNTdHJvbmdQb2xpY3kgPyAnUEFTUycgOiAnV0FSTklORycsXHJcbiAgICAgICAgICBkZXRhaWxzOiBgUGFzc3dvcmQgcG9saWN5OiBNaW4gbGVuZ3RoICR7cGFzc3dvcmRQb2xpY3k/Lk1pbmltdW1MZW5ndGggfHwgJ04vQSd9LCBVcHBlcmNhc2U6ICR7cGFzc3dvcmRQb2xpY3k/LlJlcXVpcmVVcHBlcmNhc2UgfHwgZmFsc2V9LCBMb3dlcmNhc2U6ICR7cGFzc3dvcmRQb2xpY3k/LlJlcXVpcmVMb3dlcmNhc2UgfHwgZmFsc2V9LCBOdW1iZXJzOiAke3Bhc3N3b3JkUG9saWN5Py5SZXF1aXJlTnVtYmVycyB8fCBmYWxzZX1gLFxyXG4gICAgICAgICAgcmVjb21tZW5kYXRpb246IGhhc1N0cm9uZ1BvbGljeSA/IHVuZGVmaW5lZCA6ICdTdHJlbmd0aGVuIENvZ25pdG8gcGFzc3dvcmQgcG9saWN5IHJlcXVpcmVtZW50cydcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY2F0ZWdvcnk6ICdBY2Nlc3MgQ29udHJvbCcsXHJcbiAgICAgICAgICBjaGVjazogJ0NvZ25pdG8gVXNlciBQb29sIENvbmZpZ3VyYXRpb24nLFxyXG4gICAgICAgICAgc3RhdHVzOiAnUEFTUycsXHJcbiAgICAgICAgICBkZXRhaWxzOiBgRm91bmQgJHt1c2VyUG9vbElkcy5sZW5ndGh9IFRyaW5pdHkgdXNlciBwb29scyBjb25maWd1cmVkYFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICAgIGNhdGVnb3J5OiAnQWNjZXNzIENvbnRyb2wnLFxyXG4gICAgICAgICAgY2hlY2s6ICdDb2duaXRvIFVzZXIgUG9vbCBDb25maWd1cmF0aW9uJyxcclxuICAgICAgICAgIHN0YXR1czogJ1dBUk5JTkcnLFxyXG4gICAgICAgICAgZGV0YWlsczogJ05vIFRyaW5pdHkgdXNlciBwb29scyBmb3VuZCcsXHJcbiAgICAgICAgICByZWNvbW1lbmRhdGlvbjogJ0Vuc3VyZSBDb2duaXRvIFVzZXIgUG9vbHMgYXJlIHByb3Blcmx5IGNvbmZpZ3VyZWQgZm9yIGF1dGhlbnRpY2F0aW9uJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgY2F0ZWdvcnk6ICdBY2Nlc3MgQ29udHJvbCcsXHJcbiAgICAgICAgY2hlY2s6ICdDb2duaXRvIENvbmZpZ3VyYXRpb24nLFxyXG4gICAgICAgIHN0YXR1czogJ1dBUk5JTkcnLFxyXG4gICAgICAgIGRldGFpbHM6ICdDb3VsZCBub3QgdmFsaWRhdGUgQ29nbml0byBjb25maWd1cmF0aW9uJyxcclxuICAgICAgICByZWNvbW1lbmRhdGlvbjogJ01hbnVhbGx5IHZlcmlmeSBDb2duaXRvIFVzZXIgUG9vbCBzZXR0aW5ncydcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc29sZS5sb2coYCAgIOKchSBBY2Nlc3MgY29udHJvbCB2YWxpZGF0aW9uIGNvbXBsZXRlZGApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUF1ZGl0TG9nZ2luZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OdIFZhbGlkYXRpbmcgQXVkaXQgTG9nZ2luZy4uLicpO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBDbG91ZFRyYWlsIGNvbmZpZ3VyYXRpb25cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG91dHB1dCA9IGV4ZWNTeW5jKFxyXG4gICAgICAgIGBhd3MgY2xvdWR0cmFpbCBkZXNjcmliZS10cmFpbHMgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1xdWVyeSBcInRyYWlsTGlzdFs/SXNNdWx0aVJlZ2lvblRyYWlsXS5OYW1lXCIgLS1vdXRwdXQgdGV4dGAsXHJcbiAgICAgICAgeyBlbmNvZGluZzogJ3V0ZjgnIH1cclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHRyYWlscyA9IG91dHB1dC50cmltKCkuc3BsaXQoJ1xcdCcpLmZpbHRlcih0cmFpbCA9PiB0cmFpbC5sZW5ndGggPiAwKTtcclxuICAgICAgXHJcbiAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBjYXRlZ29yeTogJ0F1ZGl0IExvZ2dpbmcnLFxyXG4gICAgICAgIGNoZWNrOiAnQ2xvdWRUcmFpbCBDb25maWd1cmF0aW9uJyxcclxuICAgICAgICBzdGF0dXM6IHRyYWlscy5sZW5ndGggPiAwID8gJ1BBU1MnIDogJ1dBUk5JTkcnLFxyXG4gICAgICAgIGRldGFpbHM6IGBGb3VuZCAke3RyYWlscy5sZW5ndGh9IG11bHRpLXJlZ2lvbiBDbG91ZFRyYWlsIHRyYWlsc2AsXHJcbiAgICAgICAgcmVjb21tZW5kYXRpb246IHRyYWlscy5sZW5ndGggPT09IDAgPyAnRW5hYmxlIENsb3VkVHJhaWwgZm9yIGF1ZGl0IGxvZ2dpbmcgYW5kIGNvbXBsaWFuY2UnIDogdW5kZWZpbmVkXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gQ2hlY2sgaWYgQ2xvdWRUcmFpbCBpcyBsb2dnaW5nIEFQSSBjYWxsc1xyXG4gICAgICBpZiAodHJhaWxzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCB0cmFpbE5hbWUgPSB0cmFpbHNbMF07XHJcbiAgICAgICAgY29uc3Qgc3RhdHVzT3V0cHV0ID0gZXhlY1N5bmMoXHJcbiAgICAgICAgICBgYXdzIGNsb3VkdHJhaWwgZ2V0LXRyYWlsLXN0YXR1cyAtLW5hbWUgJHt0cmFpbE5hbWV9IC0tcmVnaW9uICR7dGhpcy5yZWdpb259IC0tcXVlcnkgXCJJc0xvZ2dpbmdcIiAtLW91dHB1dCB0ZXh0YCxcclxuICAgICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBpc0xvZ2dpbmcgPSBzdGF0dXNPdXRwdXQudHJpbSgpID09PSAnVHJ1ZSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgY2F0ZWdvcnk6ICdBdWRpdCBMb2dnaW5nJyxcclxuICAgICAgICAgIGNoZWNrOiAnQ2xvdWRUcmFpbCBBY3RpdmUgTG9nZ2luZycsXHJcbiAgICAgICAgICBzdGF0dXM6IGlzTG9nZ2luZyA/ICdQQVNTJyA6ICdGQUlMJyxcclxuICAgICAgICAgIGRldGFpbHM6IGBDbG91ZFRyYWlsIGxvZ2dpbmcgaXMgJHtpc0xvZ2dpbmcgPyAnYWN0aXZlJyA6ICdpbmFjdGl2ZSd9YCxcclxuICAgICAgICAgIHJlY29tbWVuZGF0aW9uOiBpc0xvZ2dpbmcgPyB1bmRlZmluZWQgOiAnRW5hYmxlIENsb3VkVHJhaWwgbG9nZ2luZyBmb3Igc2VjdXJpdHkgbW9uaXRvcmluZydcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBjYXRlZ29yeTogJ0F1ZGl0IExvZ2dpbmcnLFxyXG4gICAgICAgIGNoZWNrOiAnQ2xvdWRUcmFpbCBDb25maWd1cmF0aW9uJyxcclxuICAgICAgICBzdGF0dXM6ICdXQVJOSU5HJyxcclxuICAgICAgICBkZXRhaWxzOiAnQ291bGQgbm90IHZhbGlkYXRlIENsb3VkVHJhaWwgY29uZmlndXJhdGlvbicsXHJcbiAgICAgICAgcmVjb21tZW5kYXRpb246ICdNYW51YWxseSB2ZXJpZnkgQ2xvdWRUcmFpbCBzZXR1cCBmb3IgYXVkaXQgbG9nZ2luZydcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc29sZS5sb2coYCAgIOKchSBBdWRpdCBsb2dnaW5nIHZhbGlkYXRpb24gY29tcGxldGVkYCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGdlbmVyYXRlUmVwb3J0KCk6IHZvaWQge1xyXG4gICAgY29uc3QgcmVwb3J0UGF0aCA9ICdzZWN1cml0eS1jb21wbGlhbmNlLXJlcG9ydC5qc29uJztcclxuICAgIFxyXG4gICAgY29uc3Qgc3VtbWFyeSA9IHtcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHRvdGFsQ2hlY2tzOiB0aGlzLnJlc3VsdHMubGVuZ3RoLFxyXG4gICAgICBwYXNzZWRDaGVja3M6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ1BBU1MnKS5sZW5ndGgsXHJcbiAgICAgIHdhcm5pbmdDaGVja3M6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ1dBUk5JTkcnKS5sZW5ndGgsXHJcbiAgICAgIGZhaWxlZENoZWNrczogdGhpcy5yZXN1bHRzLmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnRkFJTCcpLmxlbmd0aCxcclxuICAgICAgb3ZlcmFsbFN0YXR1czogdGhpcy5yZXN1bHRzLnNvbWUociA9PiByLnN0YXR1cyA9PT0gJ0ZBSUwnKSA/ICdORUVEU19BVFRFTlRJT04nIDogXHJcbiAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVzdWx0cy5zb21lKHIgPT4gci5zdGF0dXMgPT09ICdXQVJOSU5HJykgPyAnUkVWSUVXX1JFQ09NTUVOREVEJyA6ICdDT01QTElBTlQnXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBjb25zdCByZXBvcnQgPSB7XHJcbiAgICAgIHN1bW1hcnksXHJcbiAgICAgIGRldGFpbHM6IHRoaXMucmVzdWx0cyxcclxuICAgICAgcmVjb21tZW5kYXRpb25zOiB0aGlzLnJlc3VsdHNcclxuICAgICAgICAuZmlsdGVyKHIgPT4gci5yZWNvbW1lbmRhdGlvbilcclxuICAgICAgICAubWFwKHIgPT4gKHsgY2F0ZWdvcnk6IHIuY2F0ZWdvcnksIGNoZWNrOiByLmNoZWNrLCByZWNvbW1lbmRhdGlvbjogci5yZWNvbW1lbmRhdGlvbiB9KSlcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZzLndyaXRlRmlsZVN5bmMocmVwb3J0UGF0aCwgSlNPTi5zdHJpbmdpZnkocmVwb3J0LCBudWxsLCAyKSk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OKIFNlY3VyaXR5ICYgQ29tcGxpYW5jZSBTdW1tYXJ5OicpO1xyXG4gICAgY29uc29sZS5sb2coYCAgIFRvdGFsIENoZWNrczogJHtzdW1tYXJ5LnRvdGFsQ2hlY2tzfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIFBhc3NlZDogJHtzdW1tYXJ5LnBhc3NlZENoZWNrc31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBXYXJuaW5nczogJHtzdW1tYXJ5Lndhcm5pbmdDaGVja3N9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAgRmFpbGVkOiAke3N1bW1hcnkuZmFpbGVkQ2hlY2tzfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIE92ZXJhbGwgU3RhdHVzOiAke3N1bW1hcnkub3ZlcmFsbFN0YXR1c31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBSZXBvcnQgc2F2ZWQgdG86ICR7cmVwb3J0UGF0aH1gKTtcclxuICAgIFxyXG4gICAgaWYgKHN1bW1hcnkub3ZlcmFsbFN0YXR1cyA9PT0gJ0NPTVBMSUFOVCcpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1xcbvCfjokgU2VjdXJpdHkgYW5kIGNvbXBsaWFuY2UgdmFsaWRhdGlvbiBwYXNzZWQhJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgQWxsIGNyaXRpY2FsIHNlY3VyaXR5IHJlcXVpcmVtZW50cyBtZXQnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7imqDvuI8gU2VjdXJpdHkgYW5kIGNvbXBsaWFuY2UgcmV2aWV3IG5lZWRlZCcpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgY3JpdGljYWxJc3N1ZXMgPSB0aGlzLnJlc3VsdHMuZmlsdGVyKHIgPT4gci5zdGF0dXMgPT09ICdGQUlMJyk7XHJcbiAgICAgIGNvbnN0IHdhcm5pbmdzID0gdGhpcy5yZXN1bHRzLmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnV0FSTklORycpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGNyaXRpY2FsSXNzdWVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFxu4p2MIENyaXRpY2FsIElzc3VlczonKTtcclxuICAgICAgICBjcml0aWNhbElzc3Vlcy5mb3JFYWNoKGlzc3VlID0+IHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAtICR7aXNzdWUuY2F0ZWdvcnl9OiAke2lzc3VlLmNoZWNrfSAtICR7aXNzdWUuZGV0YWlsc31gKTtcclxuICAgICAgICAgIGlmIChpc3N1ZS5yZWNvbW1lbmRhdGlvbikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgICBSZWNvbW1lbmRhdGlvbjogJHtpc3N1ZS5yZWNvbW1lbmRhdGlvbn1gKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKHdhcm5pbmdzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFxu4pqg77iPIFdhcm5pbmdzOicpO1xyXG4gICAgICAgIHdhcm5pbmdzLmZvckVhY2god2FybmluZyA9PiB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgLSAke3dhcm5pbmcuY2F0ZWdvcnl9OiAke3dhcm5pbmcuY2hlY2t9IC0gJHt3YXJuaW5nLmRldGFpbHN9YCk7XHJcbiAgICAgICAgICBpZiAod2FybmluZy5yZWNvbW1lbmRhdGlvbikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgICBSZWNvbW1lbmRhdGlvbjogJHt3YXJuaW5nLnJlY29tbWVuZGF0aW9ufWApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBFeGVjdXRlIGlmIHJ1biBkaXJlY3RseVxyXG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcclxuICBjb25zdCB2YWxpZGF0b3IgPSBuZXcgU2VjdXJpdHlDb21wbGlhbmNlVmFsaWRhdG9yKCk7XHJcbiAgdmFsaWRhdG9yLnZhbGlkYXRlQWxsKCkudGhlbihyZXN1bHRzID0+IHtcclxuICAgIGNvbnN0IGhhc0NyaXRpY2FsSXNzdWVzID0gcmVzdWx0cy5zb21lKHIgPT4gci5zdGF0dXMgPT09ICdGQUlMJyk7XHJcbiAgICBwcm9jZXNzLmV4aXQoaGFzQ3JpdGljYWxJc3N1ZXMgPyAxIDogMCk7XHJcbiAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgY29uc29sZS5lcnJvcign8J+SpSBTZWN1cml0eSB2YWxpZGF0aW9uIGZhaWxlZDonLCBlcnJvcik7XHJcbiAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IFNlY3VyaXR5Q29tcGxpYW5jZVZhbGlkYXRvciB9OyJdfQ==