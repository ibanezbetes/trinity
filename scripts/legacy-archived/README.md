# Legacy Deployment Scripts Archive

This directory contains deployment scripts that were used before the CDK migration.

## Migration Completed: 2026-02-01T01:07:53.304Z

These scripts are archived for historical reference but should NOT be used for deployment.

## Current Deployment Method

Use CDK for all deployments:

```bash
cd infrastructure/clean
npm run deploy:all    # Deploy all stacks
npm run hotswap       # Fast development deployment
```

## Archived Scripts

The following legacy deployment methods have been replaced by CDK:

- **deploy-all-lambdas**: Replaced by `cdk deploy TrinityLambdaStack`
- **deploy-cache-system**: Replaced by `cdk deploy TrinityDatabaseStack`
- **deploy-matchmaking**: Replaced by `cdk deploy TrinityMatchmakingStack`
- **update-lambda-and-deploy**: Replaced by `cdk hotswap`

## Infrastructure Management

All infrastructure is now managed through CDK stacks:

1. **TrinityDatabaseStack** - DynamoDB tables
2. **TrinityLambdaStack** - Lambda functions  
3. **TrinityApiStack** - AppSync GraphQL APIs
4. **TrinityCognitoStack** - User authentication
5. **TrinityMonitoringStack** - CloudWatch monitoring

## DO NOT USE THESE ARCHIVED SCRIPTS

Using these scripts could cause conflicts with CDK-managed resources.
