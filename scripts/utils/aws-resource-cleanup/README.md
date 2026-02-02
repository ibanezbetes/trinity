# Trinity AWS Resource Cleanup Script

## Overview

This script performs a comprehensive cleanup of all Trinity-related AWS resources in the eu-west-1 region as part of the architectural stabilization process. It is designed to achieve a completely clean AWS state before fresh CDK deployment.

**⚠️ WARNING: This is a DESTRUCTIVE operation that will delete ALL Trinity resources!**

## Requirements

- **Task 1 must be completed**: Ensure you have completed the backup process before running this script
- **AWS credentials configured**: The script uses your configured AWS credentials
- **Proper permissions**: Your AWS user/role must have deletion permissions for all resource types

## What This Script Does

The script scans the eu-west-1 region and deletes all resources with "trinity-" or "Trinity" in their names:

### Resource Types Cleaned Up

1. **Lambda Functions** - All Trinity Lambda functions (7 expected)
2. **DynamoDB Tables** - All Trinity DynamoDB tables (12 expected)
3. **CloudFormation Stacks** - All non-CDK CloudFormation stacks
4. **AppSync GraphQL APIs** - All Trinity AppSync APIs (2 expected)
5. **IAM Roles** - All Trinity IAM roles and their policies
6. **S3 Buckets** - All Trinity S3 buckets and their contents
7. **API Gateway APIs** - All Trinity API Gateway instances
8. **Cognito User Pools** - All Trinity Cognito User Pools and clients

### Cleanup Order

The script executes cleanup in dependency order to avoid conflicts:

1. Lambda Functions (no dependencies)
2. AppSync APIs (may depend on Lambda)
3. API Gateway APIs (may depend on Lambda)
4. DynamoDB Tables (may be used by Lambda)
5. Cognito User Pools (may be used by APIs)
6. IAM Roles (may be used by other services)
7. S3 Buckets (may contain deployment artifacts)
8. CloudFormation Stacks (may manage other resources)

## Usage

### JavaScript Version (Recommended)

```bash
# From project root
node scripts/utils/aws-resource-cleanup/aws-resource-cleanup.js
```

### TypeScript Version

```bash
# From project root
npx ts-node scripts/utils/aws-resource-cleanup/aws-resource-cleanup.ts
```

## Prerequisites

### 1. Complete Task 1 Backup

Ensure you have completed Task 1 (Pre-Migration Backup and Assessment) before running this script. The backup should include:

- All Lambda function code from AWS Console
- Current AWS resource inventory
- Existing `.env` configuration
- CDK settings backup

### 2. AWS Credentials

The script uses your configured AWS credentials. Ensure they are set up via one of:

- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- AWS CLI configuration (`aws configure`)
- IAM roles (if running on EC2)
- The `.env` file in the project root

### 3. Required Permissions

Your AWS user/role needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:ListFunctions",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "dynamodb:ListTables",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "cloudformation:ListStacks",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "appsync:ListGraphqlApis",
        "appsync:DeleteGraphqlApi",
        "appsync:GetGraphqlApi",
        "iam:ListRoles",
        "iam:DeleteRole",
        "iam:ListRolePolicies",
        "iam:DeleteRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:DetachRolePolicy",
        "s3:ListAllMyBuckets",
        "s3:DeleteBucket",
        "s3:ListBucket",
        "s3:DeleteObject",
        "apigateway:GET",
        "apigateway:DELETE",
        "cognito-idp:ListUserPools",
        "cognito-idp:DeleteUserPool",
        "cognito-idp:ListUserPoolClients",
        "cognito-idp:DeleteUserPoolClient"
      ],
      "Resource": "*"
    }
  ]
}
```

## Output

The script provides detailed output including:

- Progress indicators for each resource type
- Individual resource deletion status
- Final cleanup summary with counts
- Clean state verification results
- Error details for any failed deletions

### Example Output

```
🧹 Starting Trinity AWS Resource Cleanup...
Region: eu-west-1
⚠️  WARNING: This is a DESTRUCTIVE operation!

🚀 Scanning Lambda functions...
Found 7 Trinity Lambda functions
  Deleting Lambda function: trinity-auth-dev
  Deleting Lambda function: trinity-cache-dev
  ...

🗄️ Scanning DynamoDB tables...
Found 12 Trinity DynamoDB tables
  Deleting DynamoDB table: trinity-users-dev
  Deleting DynamoDB table: trinity-rooms-dev-v2
  ...

🔍 Verifying clean state...
✅ No Trinity Lambda functions remaining
✅ No Trinity DynamoDB tables remaining
✅ No Trinity AppSync APIs remaining

📊 Cleanup Summary:
Total resources processed: 25
Successfully deleted: 24
Failed to delete: 1
Skipped: 0
Clean state achieved: ✅ Yes
```

## Error Handling

The script includes comprehensive error handling:

- **Individual resource failures** don't stop the overall process
- **Throttling protection** with delays between operations
- **Dependency handling** for resources that can't be deleted immediately
- **Detailed error reporting** for troubleshooting

### Common Issues

1. **Permission Denied**: Ensure your AWS credentials have sufficient permissions
2. **Resource Dependencies**: Some resources may fail if dependencies still exist
3. **Rate Limiting**: The script includes delays, but AWS may still throttle requests
4. **Resource Not Found**: Resources may have been deleted manually or by other processes

## Verification

After cleanup, the script automatically verifies the clean state by:

1. Re-scanning for any remaining Trinity resources
2. Reporting any resources that couldn't be deleted
3. Confirming zero Trinity resources remain

### Manual Verification

You can also manually verify using AWS CLI:

```bash
# Check Lambda functions
aws lambda list-functions --region eu-west-1 --query 'Functions[?contains(FunctionName, `trinity`)]'

# Check DynamoDB tables
aws dynamodb list-tables --region eu-west-1 --query 'TableNames[?contains(@, `trinity`)]'

# Check AppSync APIs
aws appsync list-graphql-apis --region eu-west-1 --query 'graphqlApis[?contains(name, `trinity`)]'
```

## Safety Features

- **Prefix filtering**: Only deletes resources with Trinity prefixes
- **Region scoping**: Only operates in eu-west-1 region
- **Detailed logging**: Full audit trail of all operations
- **Error isolation**: Individual failures don't affect other resources
- **Clean state verification**: Confirms successful cleanup

## Integration with Task 2.2

This script is designed to be used as part of Task 2.2 (Execute complete AWS cleanup). After running this script successfully, you should proceed with:

1. Task 2.3: Verify clean AWS state
2. Task 3: Code Consolidation and Migration
3. Fresh CDK deployment

## Troubleshooting

### Script Fails to Start

- Check AWS credentials configuration
- Verify network connectivity to AWS
- Ensure required Node.js packages are installed

### Partial Cleanup

- Review error messages for specific failures
- Check AWS Console for resources that couldn't be deleted
- Re-run the script (it's safe to run multiple times)
- Manually delete stubborn resources if necessary

### Clean State Not Achieved

- Check the verification output for remaining resources
- Some resources may have dependencies outside Trinity
- Consider manual cleanup for edge cases

## Related Files

- `aws-resource-cleanup.ts` - TypeScript version of the script
- `aws-resource-cleanup.js` - JavaScript version of the script (recommended)
- `../../verify-aws-config/verify-aws-config.js` - AWS configuration verification
- `../../../e2e-backend-test/e2e-backend-test.js` - End-to-end testing after deployment

## Requirements Satisfied

This script satisfies the following requirements from the Trinity Architectural Stabilization spec:

- **Requirement 4.2**: Identify and remove Resource_Zombie instances
- **Requirement 4.5**: Verify no orphaned resources remain outside CDK management

The script ensures a completely clean AWS state before fresh CDK deployment, eliminating all potential conflicts and resource zombies.