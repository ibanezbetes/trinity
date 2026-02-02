# Trinity Configuration Management System

## Overview

Trinity uses AWS Systems Manager Parameter Store for centralized configuration management with automatic fallback to environment variables. This system provides secure, hierarchical parameter organization with built-in caching and validation.

## Parameter Hierarchy

All parameters follow the strict naming pattern: `/trinity/{env}/{category}/{param}`

### Categories

- **`external/`** - External API keys and service endpoints
- **`auth/`** - Authentication and authorization configuration  
- **`api/`** - API endpoints and service URLs
- **`security/`** - Security-related secrets and keys
- **`dynamodb/`** - Database configuration (JSON)
- **`lambda/`** - Lambda function names (JSON)
- **`app/`** - Application settings (JSON)

### Parameter Types

- **SecureString** - Encrypted parameters for sensitive data
- **String** - Regular parameters for non-sensitive configuration
- **JSON String** - Complex configuration objects

## Critical Parameters

### External Services (SecureString)
- `/trinity/dev/external/tmdb-api-key` - TMDB API key for movie data

### Authentication (Mixed)
- `/trinity/dev/auth/cognito-user-pool-id` (String)
- `/trinity/dev/auth/cognito-client-id` (String)
- `/trinity/dev/auth/google-web-client-id` (SecureString)
- `/trinity/dev/auth/google-client-secret` (SecureString)
- `/trinity/dev/auth/google-android-client-id` (SecureString)
- `/trinity/dev/auth/google-ios-client-id` (SecureString)

### API Endpoints (String)
- `/trinity/dev/api/appsync-api-id`
- `/trinity/dev/api/appsync-api-url`
- `/trinity/dev/api/realtime-api-url`

### Security (SecureString)
- `/trinity/dev/security/jwt-secret`

### Complex Configuration (JSON String)
- `/trinity/dev/dynamodb/table-names` - All DynamoDB table names
- `/trinity/dev/lambda/function-names` - All Lambda function names
- `/trinity/dev/app/config` - Application settings
- `/trinity/dev/app/feature-flags` - Feature toggle configuration

## Usage

### 1. Hydrate Parameter Store

Create/update all parameters from your `.env` file:

```bash
cd infrastructure/clean
npm run hydrate-ssm
```

This script:
- Reads your local `.env` file
- Creates all parameters in AWS Parameter Store
- Uses proper encryption for sensitive parameters
- Follows the strict naming hierarchy

### 2. Validate Configuration

Check that all parameters are properly configured:

```bash
npm run validate-config
```

This validates:
- Parameter Store connectivity
- All required parameters exist
- Parameter values are valid
- Configuration loading works correctly

### 3. Validate SSM Parameters

Quick check of Parameter Store parameters:

```bash
npm run validate-ssm
```

### 4. Use in Lambda Functions

```typescript
import { getTrinityConfig } from '../shared/config';

// Load configuration with automatic fallback
const config = await getTrinityConfig();

// Access configuration values
const tmdbApiKey = config.external.tmdbApiKey;
const userPoolId = config.external.cognitoUserPoolId;
const tableNames = config.tables;
```

### 5. Advanced Configuration Loading

```typescript
import { ConfigLoader, ConfigUtils } from '../shared/config-loader';

// Load with validation
const loader = new ConfigLoader();
const { config, validation } = await loader.loadValidatedConfig();

if (!validation.isValid) {
  console.warn('Configuration issues:', validation.errors);
}

// Get parameter information
const paramInfo = await loader.getParameterInfo('/trinity/dev/external/tmdb-api-key');
console.log(`Parameter version: ${paramInfo?.version}`);

// Get configuration summary
const summary = await loader.getConfigurationSummary();
console.log(`Found ${summary.parameterCount} parameters`);
```

## Configuration Fallback

The system automatically falls back to environment variables if Parameter Store is unavailable:

1. **Primary**: AWS Systems Manager Parameter Store
2. **Fallback**: Environment variables from `.env` file
3. **Cache**: 5-minute in-memory cache to reduce SSM calls

## Security Features

- **Encryption**: Sensitive parameters use SecureString encryption
- **Access Control**: IAM policies restrict parameter access
- **Audit Trail**: All parameter changes are logged in CloudTrail
- **Validation**: Comprehensive validation of all configuration values

## Environment Support

- **Development** (`dev`) - Local development and testing
- **Staging** (`staging`) - Pre-production testing
- **Production** (`production`) - Live environment

Each environment has its own parameter namespace.

## Monitoring

The configuration system includes:

- **Health Checks**: Automatic connectivity validation
- **Performance Metrics**: Cache hit rates and load times
- **Error Handling**: Graceful fallback with detailed logging
- **Validation Reports**: Comprehensive configuration validation

## Property-Based Testing

The configuration system is validated with property-based tests:

```bash
npm test -- configuration-externalization.property.test.ts
```

Tests validate:
- Parameter hierarchy consistency
- Security parameter encryption
- Fallback mechanism reliability
- Configuration caching behavior
- JSON parameter parsing accuracy

## Troubleshooting

### Common Issues

1. **Parameter Not Found**
   ```bash
   # Check if parameter exists
   aws ssm get-parameter --name "/trinity/dev/external/tmdb-api-key" --region eu-west-1
   
   # Recreate parameters
   npm run hydrate-ssm
   ```

2. **Access Denied**
   ```bash
   # Check IAM permissions
   aws sts get-caller-identity
   
   # Verify Lambda execution role has SSM permissions
   ```

3. **Configuration Validation Fails**
   ```bash
   # Run detailed validation
   npm run validate-config
   
   # Check specific parameter
   npm run validate-ssm
   ```

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
npm run validate-config
```

## Best Practices

1. **Always use the hydration script** - Don't create parameters manually
2. **Validate after changes** - Run validation scripts after updates
3. **Use proper encryption** - Sensitive data must use SecureString
4. **Follow naming convention** - Strict hierarchy prevents conflicts
5. **Test fallback behavior** - Ensure environment variables work as backup
6. **Monitor parameter usage** - Track which parameters are accessed
7. **Regular validation** - Include config validation in CI/CD pipelines

## Integration with CDK

The Parameter Store configuration is fully integrated with CDK:

```typescript
// In CDK stacks
const parameterStore = new TrinityParameterStore(this, 'ParameterStore', config);

// Grant Lambda functions access to parameters
parameterStore.grantReadAccess(lambdaFunction);
```

This ensures:
- Consistent parameter creation
- Proper IAM permissions
- Infrastructure as Code management
- Automated deployment integration