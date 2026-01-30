# Trinity AI Assistant - Troubleshooting Guide

## Quick Diagnosis

### 1. Check Function Status
```bash
aws lambda get-function --function-name trinity-ai-dev --region eu-west-1
```

### 2. View Recent Logs
```bash
aws logs tail /aws/lambda/trinity-ai-dev --follow --region eu-west-1 --since 10m
```

### 3. Test Function
```bash
aws lambda invoke --function-name trinity-ai-dev \
  --cli-binary-format raw-in-base64-out \
  --payload '{"info":{"fieldName":"getChatRecommendations"},"arguments":{"text":"test","userId":"test"}}' \
  --region eu-west-1 response.json && cat response.json
```

## Common Issues & Solutions

### Issue 1: Empty Response Array `[]`

**Symptoms:**
- Function returns empty array instead of expected response
- Status code 200 but no data

**Diagnosis:**
```bash
# Check recent logs for field name mapping
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "fieldName" --region eu-west-1 --start-time $(date -d '10 minutes ago' +%s)000
```

**Root Causes:**
1. Wrong GraphQL field name in request
2. Function calling wrong internal method
3. Missing arguments in request

**Solutions:**
```bash
# 1. Verify correct field names in handler
grep -n "fieldName" lambdas/trinity-ai-dev/ai.js

# 2. Test with correct field name
aws lambda invoke --function-name trinity-ai-dev \
  --cli-binary-format raw-in-base64-out \
  --payload '{"info":{"fieldName":"getChatRecommendations"},"arguments":{"text":"action movies","userId":"test-123"}}' \
  --region eu-west-1 response.json
```

### Issue 2: Environment Validation Failed

**Symptoms:**
- "Configuration Error" response
- "Service temporarily unavailable" message

**Diagnosis:**
```bash
# Check environment variables
aws lambda get-function-configuration --function-name trinity-ai-dev --region eu-west-1 | jq '.Environment.Variables'
```

**Root Causes:**
1. Missing required environment variables
2. Empty API keys
3. Invalid credentials

**Solutions:**
```bash
# Update environment variables
aws lambda update-function-configuration --function-name trinity-ai-dev \
  --environment Variables="{
    TMDB_API_KEY=dc4dbcd2404c1ca852f8eb964add267d,
    HUGGINGFACE_API_KEY=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,
    HF_API_TOKEN=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,
    CHAT_SESSIONS_TABLE=trinity-chat-sessions-dev,
    USERS_TABLE=trinity-users-dev,
    MOVIES_CACHE_TABLE=trinity-movies-cache-dev,
    ROOMS_TABLE=trinity-rooms-dev-v2,
    ROOM_MEMBERS_TABLE=trinity-room-members-dev,
    VOTES_TABLE=trinity-votes-dev,
    ROOM_MATCHES_TABLE=trinity-room-matches-dev,
    ROOM_INVITES_TABLE=trinity-room-invites-dev-v2,
    CONNECTIONS_TABLE=trinity-connections-dev,
    USER_POOL_ID=eu-west-1_EtOx2swvP,
    USER_POOL_CLIENT_ID=l08ofv6tef7dp8eorn022fqpj
  }" --region eu-west-1
```

### Issue 3: CloudWatch Permissions Error

**Symptoms:**
- `AccessDenied: cloudwatch:PutMetricData` in logs
- Function works but metrics fail

**Diagnosis:**
```bash
# Check Lambda execution role
aws lambda get-function --function-name trinity-ai-dev --region eu-west-1 | jq '.Configuration.Role'
```

**Root Causes:**
- Lambda execution role lacks CloudWatch permissions

**Solutions:**
```bash
# Option 1: Add CloudWatch permissions to role (requires admin access)
# Option 2: Disable metrics in code (temporary fix)
# The function will continue working; only metrics collection fails
```

### Issue 4: Hugging Face API Errors

**Symptoms:**
- AI service failures
- Timeout errors
- "Model loading" errors

**Diagnosis:**
```bash
# Test Hugging Face API directly
curl -H "Authorization: Bearer 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" \
  https://api-inference.huggingface.co/models/BSC-LT/salamandra-2b-instruct \
  -d '{"inputs":"Hello"}'
```

**Root Causes:**
1. Invalid API token
2. Model cold start (first request after inactivity)
3. Rate limiting
4. Model unavailable

**Solutions:**
```bash
# 1. Verify API token in environment
aws lambda get-function-configuration --function-name trinity-ai-dev --region eu-west-1 | jq '.Environment.Variables.HF_API_TOKEN'

# 2. Wait for model warm-up (20-30 seconds)
# 3. Implement retry logic (already in code)
# 4. Check Hugging Face status page
```

### Issue 5: TMDB API Failures

**Symptoms:**
- Movie verification failures
- Empty movie results
- TMDB timeout errors

**Diagnosis:**
```bash
# Test TMDB API directly
curl "https://api.themoviedb.org/3/search/movie?api_key=dc4dbcd2404c1ca852f8eb964add267d&query=matrix"
```

**Root Causes:**
1. Invalid TMDB API key
2. Rate limiting (40 requests per 10 seconds)
3. Network connectivity issues

**Solutions:**
```bash
# 1. Verify API key
aws lambda get-function-configuration --function-name trinity-ai-dev --region eu-west-1 | jq '.Environment.Variables.TMDB_API_KEY'

# 2. Check rate limits in logs
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "TMDB" --region eu-west-1

# 3. Function has fallback mechanisms built-in
```

### Issue 6: DynamoDB Chat Session Errors

**Symptoms:**
- Session persistence failures
- "Table not found" errors
- Permission denied errors

**Diagnosis:**
```bash
# Check if table exists
aws dynamodb describe-table --table-name trinity-chat-sessions-dev --region eu-west-1

# Check Lambda permissions
aws iam get-role-policy --role-name TrinityMvpStack-AiHandlerServiceRoleB8E36A16-1lpSlWhaw7ji --policy-name DynamoDBPolicy --region eu-west-1
```

**Root Causes:**
1. Table doesn't exist
2. Insufficient DynamoDB permissions
3. Wrong table name in environment

**Solutions:**
```bash
# 1. Create table if missing
aws dynamodb create-table \
  --table-name trinity-chat-sessions-dev \
  --attribute-definitions AttributeName=sessionId,AttributeType=S \
  --key-schema AttributeName=sessionId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-west-1

# 2. Verify table name in environment
aws lambda get-function-configuration --function-name trinity-ai-dev --region eu-west-1 | jq '.Environment.Variables.CHAT_SESSIONS_TABLE'
```

### Issue 7: Function Timeout

**Symptoms:**
- "Task timed out after 30.00 seconds"
- Incomplete responses

**Diagnosis:**
```bash
# Check function timeout configuration
aws lambda get-function-configuration --function-name trinity-ai-dev --region eu-west-1 | jq '.Timeout'

# Check average duration
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "REPORT" --region eu-west-1 --start-time $(date -d '1 hour ago' +%s)000
```

**Root Causes:**
1. Hugging Face model cold start
2. TMDB API slow responses
3. Network connectivity issues

**Solutions:**
```bash
# 1. Increase timeout (if needed)
aws lambda update-function-configuration --function-name trinity-ai-dev \
  --timeout 45 --region eu-west-1

# 2. Function has built-in 8-second timeout for AI calls
# 3. Fallback mechanisms handle timeouts gracefully
```

### Issue 8: Memory Issues

**Symptoms:**
- Out of memory errors
- Performance degradation

**Diagnosis:**
```bash
# Check memory usage
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "Max Memory Used" --region eu-west-1 --start-time $(date -d '1 hour ago' +%s)000
```

**Solutions:**
```bash
# Increase memory if consistently high usage
aws lambda update-function-configuration --function-name trinity-ai-dev \
  --memory-size 768 --region eu-west-1
```

## Debug Mode

### Enable Verbose Logging
```bash
aws lambda update-function-configuration --function-name trinity-ai-dev \
  --environment Variables="{
    DEBUG_MODE=true,
    VERBOSE_LOGGING=true,
    LOG_LEVEL=debug,
    ...other_variables...
  }" --region eu-west-1
```

### Disable Debug Mode
```bash
aws lambda update-function-configuration --function-name trinity-ai-dev \
  --environment Variables="{
    DEBUG_MODE=false,
    VERBOSE_LOGGING=false,
    LOG_LEVEL=info,
    ...other_variables...
  }" --region eu-west-1
```

## Performance Monitoring

### Key Metrics to Watch
```bash
# Function duration
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "Duration" --region eu-west-1

# Error rate
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "ERROR" --region eu-west-1

# Memory usage
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "Max Memory Used" --region eu-west-1
```

### Performance Thresholds
- **Duration**: Should be < 8 seconds (including cold start)
- **Memory**: Should be < 400MB (current limit: 512MB)
- **Error Rate**: Should be < 5%
- **Cold Start**: Should be < 2 seconds

## Emergency Procedures

### 1. Rollback to Previous Version
```bash
# List versions
aws lambda list-versions-by-function --function-name trinity-ai-dev --region eu-west-1

# Rollback to previous version
aws lambda update-alias --function-name trinity-ai-dev \
  --name LIVE --function-version $PREVIOUS_VERSION --region eu-west-1
```

### 2. Disable Function (Circuit Breaker)
```bash
# Update function to return static response
aws lambda update-function-configuration --function-name trinity-ai-dev \
  --environment Variables="{CIRCUIT_BREAKER_ENABLED=true,...}" --region eu-west-1
```

### 3. Scale Down (Reduce Concurrency)
```bash
# Limit concurrent executions
aws lambda put-provisioned-concurrency-config --function-name trinity-ai-dev \
  --provisioned-concurrency-config ProvisionedConcurrencyConfig=1 --region eu-west-1
```

## Health Checks

### Automated Health Check Script
```bash
#!/bin/bash
# health-check.sh

echo "🔍 Trinity AI Health Check"
echo "=========================="

# 1. Function status
echo "1. Function Status:"
aws lambda get-function --function-name trinity-ai-dev --region eu-west-1 --query 'Configuration.State' --output text

# 2. Recent errors
echo "2. Recent Errors (last 10 minutes):"
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "ERROR" --region eu-west-1 \
  --start-time $(date -d '10 minutes ago' +%s)000 --query 'events[].message' --output text

# 3. Test invocation
echo "3. Test Invocation:"
aws lambda invoke --function-name trinity-ai-dev \
  --cli-binary-format raw-in-base64-out \
  --payload '{"info":{"fieldName":"getChatRecommendations"},"arguments":{"text":"test","userId":"health-check"}}' \
  --region eu-west-1 /tmp/health-response.json > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Function responding"
else
  echo "❌ Function not responding"
fi

# 4. Environment variables
echo "4. Critical Environment Variables:"
aws lambda get-function-configuration --function-name trinity-ai-dev --region eu-west-1 \
  --query 'Environment.Variables.{TMDB_API_KEY:TMDB_API_KEY,HF_API_TOKEN:HF_API_TOKEN}' --output table

echo "=========================="
echo "Health check complete"
```

### Run Health Check
```bash
chmod +x health-check.sh
./health-check.sh
```

## Contact & Support

### Escalation Path
1. **Level 1**: Check this troubleshooting guide
2. **Level 2**: Review CloudWatch logs and metrics
3. **Level 3**: Test external API connectivity
4. **Level 4**: Contact Trinity development team

### Useful Resources
- [AWS Lambda Troubleshooting](https://docs.aws.amazon.com/lambda/latest/dg/troubleshooting.html)
- [Hugging Face API Documentation](https://huggingface.co/docs/api-inference/index)
- [TMDB API Documentation](https://developers.themoviedb.org/3)
- [Trinity Project Repository](https://github.com/your-org/trinity)

---

**Last Updated**: January 29, 2026
**Version**: Phase 11 Deployment
**Maintainer**: Trinity Development Team