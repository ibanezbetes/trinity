#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';

interface SecurityValidationResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  details: string;
  recommendation?: string;
}

class SecurityComplianceValidator {
  private readonly region = 'eu-west-1';
  private results: SecurityValidationResult[] = [];

  async validateAll(): Promise<SecurityValidationResult[]> {
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

  private async validateEncryption(): Promise<void> {
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
        const output = execSync(
          `aws dynamodb describe-table --table-name ${table} --region ${this.region} --query "Table.SSEDescription.Status" --output text`,
          { encoding: 'utf8' }
        );
        
        const encryptionStatus = output.trim();
        if (encryptionStatus === 'ENABLED') {
          encryptedTables++;
        }
      } catch (error) {
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
    } else {
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
        const output = execSync(
          `aws lambda get-function-configuration --function-name ${func} --region ${this.region} --query "KMSKeyArn" --output text`,
          { encoding: 'utf8' }
        );
        
        if (output.trim() !== 'None' && output.trim() !== '') {
          encryptedFunctions++;
        }
      } catch (error) {
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

  private async validateIAMPolicies(): Promise<void> {
    console.log('\n👤 Validating IAM Policies and Least Privilege...');
    
    try {
      // Check for overly permissive policies
      const output = execSync(
        `aws iam list-roles --query "Roles[?contains(RoleName, 'Trinity')].RoleName" --output text --region ${this.region}`,
        { encoding: 'utf8' }
      );
      
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
            const policiesOutput = execSync(
              `aws iam list-attached-role-policies --role-name ${role} --region ${this.region} --query "AttachedPolicies[].PolicyArn" --output text`,
              { encoding: 'utf8' }
            );
            
            // This is a basic check - in production, you'd want more detailed policy analysis
            if (policiesOutput.includes('*')) {
              hasWildcardPolicies = true;
            }
          } catch (error) {
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
      } else {
        this.results.push({
          category: 'IAM',
          check: 'Trinity IAM Roles',
          status: 'WARNING',
          details: 'No Trinity-specific IAM roles found',
          recommendation: 'Ensure proper IAM roles are configured for Trinity resources'
        });
      }
    } catch (error) {
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

  private async validateNetworkSecurity(): Promise<void> {
    console.log('\n🌐 Validating Network Security...');
    
    // Check AppSync API authentication
    try {
      const output = execSync(
        `aws appsync list-graphql-apis --region ${this.region} --query "graphqlApis[?contains(name, 'trinity')].authenticationType" --output text`,
        { encoding: 'utf8' }
      );
      
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
    } catch (error) {
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
        const output = execSync(
          `aws lambda get-function-url-config --function-name ${func} --region ${this.region} --query "AuthType" --output text`,
          { encoding: 'utf8' }
        );
        
        if (output.trim() === 'NONE') {
          publicFunctions++;
        }
      } catch (error) {
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

  private async validateMonitoring(): Promise<void> {
    console.log('\n📊 Validating Monitoring and Alerting...');
    
    try {
      // Check CloudWatch alarms
      const output = execSync(
        `aws cloudwatch describe-alarms --region ${this.region} --query "MetricAlarms[?contains(AlarmName, 'Trinity') || contains(AlarmName, 'trinity')].AlarmName" --output text`,
        { encoding: 'utf8' }
      );
      
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
          const retentionOutput = execSync(
            `aws logs describe-log-groups --log-group-name-prefix ${logGroup} --region ${this.region} --query "logGroups[0].retentionInDays" --output text`,
            { encoding: 'utf8' }
          );
          
          if (retentionOutput.trim() !== 'None' && retentionOutput.trim() !== '') {
            retentionConfigured++;
          }
        } catch (error) {
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

    } catch (error) {
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

  private async validateDataProtection(): Promise<void> {
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
        const output = execSync(
          `aws dynamodb describe-continuous-backups --table-name ${table} --region ${this.region} --query "ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus" --output text`,
          { encoding: 'utf8' }
        );
        
        if (output.trim() === 'ENABLED') {
          pitrEnabled++;
        }
      } catch (error) {
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
        const searchResult = execSync(
          `grep -r -i "${pattern}" src/ || true`,
          { encoding: 'utf8', cwd: process.cwd() }
        );
        
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

    } catch (error) {
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

  private async validateAccessControl(): Promise<void> {
    console.log('\n🔐 Validating Access Control...');
    
    // Check Cognito User Pool configuration
    try {
      const output = execSync(
        `aws cognito-idp list-user-pools --max-results 20 --region ${this.region} --query "UserPools[?contains(Name, 'trinity')].Id" --output text`,
        { encoding: 'utf8' }
      );
      
      const userPoolIds = output.trim().split('\t').filter(id => id.length > 0);
      
      if (userPoolIds.length > 0) {
        // Check password policy for the first user pool
        const userPoolId = userPoolIds[0];
        const policyOutput = execSync(
          `aws cognito-idp describe-user-pool --user-pool-id ${userPoolId} --region ${this.region} --query "UserPool.Policies.PasswordPolicy" --output json`,
          { encoding: 'utf8' }
        );
        
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
      } else {
        this.results.push({
          category: 'Access Control',
          check: 'Cognito User Pool Configuration',
          status: 'WARNING',
          details: 'No Trinity user pools found',
          recommendation: 'Ensure Cognito User Pools are properly configured for authentication'
        });
      }
    } catch (error) {
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

  private async validateAuditLogging(): Promise<void> {
    console.log('\n📝 Validating Audit Logging...');
    
    // Check CloudTrail configuration
    try {
      const output = execSync(
        `aws cloudtrail describe-trails --region ${this.region} --query "trailList[?IsMultiRegionTrail].Name" --output text`,
        { encoding: 'utf8' }
      );
      
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
        const statusOutput = execSync(
          `aws cloudtrail get-trail-status --name ${trailName} --region ${this.region} --query "IsLogging" --output text`,
          { encoding: 'utf8' }
        );
        
        const isLogging = statusOutput.trim() === 'True';
        
        this.results.push({
          category: 'Audit Logging',
          check: 'CloudTrail Active Logging',
          status: isLogging ? 'PASS' : 'FAIL',
          details: `CloudTrail logging is ${isLogging ? 'active' : 'inactive'}`,
          recommendation: isLogging ? undefined : 'Enable CloudTrail logging for security monitoring'
        });
      }

    } catch (error) {
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

  private generateReport(): void {
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
    } else {
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

export { SecurityComplianceValidator };