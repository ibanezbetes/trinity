# Trinity AI Assistant - Monitoring & Alerting Setup

## Overview

This document provides comprehensive monitoring and alerting configuration for the Trinity AI Assistant (trinity-ai-dev) Lambda function. The monitoring strategy focuses on reliability, performance, and user experience.

## Architecture

```
Trinity AI Lambda → CloudWatch Logs → CloudWatch Metrics → CloudWatch Alarms → SNS → Notifications
                 ↓
              Custom Metrics → Dashboards → Operational Insights
```

## Key Metrics

### 1. Function-Level Metrics (AWS Lambda)

#### Duration Metrics
- **Lambda Duration**: Overall function execution time
- **Cold Start Duration**: Time for function initialization
- **Target**: < 8 seconds (including cold starts)

#### Error Metrics
- **Lambda Errors**: Function-level errors and exceptions
- **Lambda Throttles**: Concurrent execution limits hit
- **Target**: < 5% error rate

#### Resource Metrics
- **Memory Utilization**: Peak memory usage during execution
- **CPU Utilization**: Processing resource consumption
- **Target**: < 80% of allocated resources

### 2. Application-Level Metrics (Custom)

#### AI Service Metrics
- **Trini.AI.RequestCount**: Total AI service requests
- **Trini.AI.SuccessRate**: Successful AI responses
- **Trini.AI.Latency**: Time for AI model responses
- **Trini.AI.TimeoutCount**: AI requests that timed out

#### JSON Parsing Metrics
- **Trini.JSON.ParseSuccess**: Direct JSON parsing successes
- **Trini.JSON.RegexFallback**: Regex fallback activations
- **Trini.JSON.ParseFailures**: Complete parsing failures
- **Target**: < 10% fallback rate

#### Intent Classification Metrics
- **Trini.Intent.Cinema**: Cinema-related queries
- **Trini.Intent.OffTopic**: Off-topic queries blocked
- **Trini.Intent.Ratio**: Cinema vs off-topic ratio

#### TMDB Integration Metrics
- **Trini.TMDB.RequestCount**: Total TMDB API requests
- **Trini.TMDB.SuccessRate**: Successful movie verifications
- **Trini.TMDB.Latency**: TMDB API response time
- **Trini.TMDB.ParallelEfficiency**: Parallel processing effectiveness

#### Fallback Metrics
- **Trini.Fallback.Activations**: Fallback engine activations
- **Trini.Fallback.Type**: Fallback reasons (network, timeout, etc.)
- **Target**: < 15% fallback activation rate

### 3. Business Metrics

#### User Experience
- **Trini.Sessions.Created**: New chat sessions
- **Trini.Sessions.Duration**: Average session length
- **Trini.Recommendations.Count**: Movies recommended
- **Trini.Confidence.Average**: Average recommendation confidence

#### Performance
- **Trini.Response.Time**: End-to-end response time
- **Trini.Cache.HitRate**: Movie cache effectiveness
- **Trini.Parallel.Efficiency**: TMDB parallel processing gains

## CloudWatch Dashboard

### Dashboard Configuration

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/Lambda", "Duration", "FunctionName", "trinity-ai-dev"],
          ["AWS/Lambda", "Errors", "FunctionName", "trinity-ai-dev"],
          ["AWS/Lambda", "Invocations", "FunctionName", "trinity-ai-dev"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "eu-west-1",
        "title": "Lambda Performance"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["Trinity/AI", "RequestCount", "Service", "trinity-ai-dev"],
          ["Trinity/AI", "SuccessRate", "Service", "trinity-ai-dev"],
          ["Trinity/AI", "Latency", "Service", "trinity-ai-dev"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "eu-west-1",
        "title": "AI Service Metrics"
      }
    },
    {
      "type": "log",
      "properties": {
        "query": "SOURCE '/aws/lambda/trinity-ai-dev'\n| fields @timestamp, @message\n| filter @message like /ERROR/\n| sort @timestamp desc\n| limit 20",
        "region": "eu-west-1",
        "title": "Recent Errors"
      }
    }
  ]
}
```

### Create Dashboard
```bash
aws cloudwatch put-dashboard \
  --dashboard-name "Trinity-AI-Assistant" \
  --dashboard-body file://dashboard-config.json \
  --region eu-west-1
```

## Alerting Configuration

### 1. Critical Alerts (Immediate Response Required)

#### High Error Rate Alert
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "Trinity-AI-High-Error-Rate" \
  --alarm-description "Trinity AI error rate > 10%" \
  --metric-name "Errors" \
  --namespace "AWS/Lambda" \
  --statistic "Sum" \
  --period 300 \
  --threshold 10 \
  --comparison-operator "GreaterThanThreshold" \
  --evaluation-periods 2 \
  --alarm-actions "arn:aws:sns:eu-west-1:847850007406:trinity-alerts" \
  --dimensions Name=FunctionName,Value=trinity-ai-dev \
  --region eu-west-1
```

#### Function Timeout Alert
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "Trinity-AI-Timeout" \
  --alarm-description "Trinity AI function timeouts" \
  --metric-name "Duration" \
  --namespace "AWS/Lambda" \
  --statistic "Maximum" \
  --period 300 \
  --threshold 25000 \
  --comparison-operator "GreaterThanThreshold" \
  --evaluation-periods 1 \
  --alarm-actions "arn:aws:sns:eu-west-1:847850007406:trinity-alerts" \
  --dimensions Name=FunctionName,Value=trinity-ai-dev \
  --region eu-west-1
```

### 2. Warning Alerts (Monitor Closely)

#### High Fallback Rate Alert
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "Trinity-AI-High-Fallback-Rate" \
  --alarm-description "Trinity AI fallback rate > 20%" \
  --metric-name "FallbackActivations" \
  --namespace "Trinity/AI" \
  --statistic "Sum" \
  --period 600 \
  --threshold 20 \
  --comparison-operator "GreaterThanThreshold" \
  --evaluation-periods 2 \
  --alarm-actions "arn:aws:sns:eu-west-1:847850007406:trinity-warnings" \
  --dimensions Name=Service,Value=trinity-ai-dev \
  --region eu-west-1
```

#### Memory Usage Alert
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "Trinity-AI-High-Memory" \
  --alarm-description "Trinity AI memory usage > 400MB" \
  --metric-name "MemoryUtilization" \
  --namespace "AWS/Lambda" \
  --statistic "Maximum" \
  --period 300 \
  --threshold 400 \
  --comparison-operator "GreaterThanThreshold" \
  --evaluation-periods 3 \
  --alarm-actions "arn:aws:sns:eu-west-1:847850007406:trinity-warnings" \
  --dimensions Name=FunctionName,Value=trinity-ai-dev \
  --region eu-west-1
```

### 3. Information Alerts (Trend Monitoring)

#### Low Confidence Alert
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "Trinity-AI-Low-Confidence" \
  --alarm-description "Trinity AI average confidence < 0.6" \
  --metric-name "AverageConfidence" \
  --namespace "Trinity/AI" \
  --statistic "Average" \
  --period 900 \
  --threshold 0.6 \
  --comparison-operator "LessThanThreshold" \
  --evaluation-periods 3 \
  --alarm-actions "arn:aws:sns:eu-west-1:847850007406:trinity-info" \
  --dimensions Name=Service,Value=trinity-ai-dev \
  --region eu-west-1
```

## SNS Topic Configuration

### Create SNS Topics
```bash
# Critical alerts
aws sns create-topic --name trinity-alerts --region eu-west-1

# Warning alerts  
aws sns create-topic --name trinity-warnings --region eu-west-1

# Information alerts
aws sns create-topic --name trinity-info --region eu-west-1
```

### Subscribe to Alerts
```bash
# Email notifications
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-1:847850007406:trinity-alerts \
  --protocol email \
  --notification-endpoint your-email@domain.com \
  --region eu-west-1

# Slack integration (webhook)
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-1:847850007406:trinity-alerts \
  --protocol https \
  --notification-endpoint https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK \
  --region eu-west-1
```

## Log Analysis

### Important Log Patterns

#### Error Patterns
```bash
# Function errors
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "ERROR" --region eu-west-1

# AI service failures
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "AI service" --region eu-west-1

# TMDB API issues
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "TMDB" --region eu-west-1
```

#### Performance Patterns
```bash
# Slow responses
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "{ $.processingTime > 5000 }" --region eu-west-1

# Fallback activations
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "Fallback activated" --region eu-west-1
```

#### Business Patterns
```bash
# Off-topic queries
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "Off-topic intent" --region eu-west-1

# High confidence recommendations
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "{ $.confidence > 0.8 }" --region eu-west-1
```

### Log Insights Queries

#### Performance Analysis
```sql
fields @timestamp, @requestId, @duration
| filter @type = "REPORT"
| stats avg(@duration), max(@duration), min(@duration) by bin(5m)
```

#### Error Analysis
```sql
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(1h)
```

#### AI Service Analysis
```sql
fields @timestamp, requestId, phase, processingTime
| filter phase = "ai_processing_complete"
| stats avg(processingTime), max(processingTime) by bin(10m)
```

## Custom Metrics Implementation

### Metrics Service Integration

The Lambda function includes a MetricsService that publishes custom metrics to CloudWatch:

```javascript
// Example metrics being published
await metricsService.recordAIRequest(requestId, success, latency);
await metricsService.recordJSONParsing(requestId, method, success);
await metricsService.recordTMDBRequest(requestId, movieCount, latency);
await metricsService.recordFallbackActivation(requestId, reason);
```

### Metric Dimensions

All custom metrics include these dimensions:
- **Service**: "trinity-ai-dev"
- **Environment**: "dev"
- **Region**: "eu-west-1"
- **RequestId**: Unique request identifier

## Operational Runbooks

### 1. High Error Rate Response

**Trigger**: Error rate > 10% for 10 minutes

**Actions**:
1. Check CloudWatch logs for error patterns
2. Verify external API status (Hugging Face, TMDB)
3. Check environment variables configuration
4. Consider enabling circuit breaker if widespread

**Commands**:
```bash
# Check recent errors
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "ERROR" --region eu-west-1 --start-time $(date -d '30 minutes ago' +%s)000

# Check function configuration
aws lambda get-function-configuration --function-name trinity-ai-dev --region eu-west-1
```

### 2. High Latency Response

**Trigger**: Average duration > 8 seconds for 15 minutes

**Actions**:
1. Check for cold start issues
2. Monitor external API response times
3. Review memory usage patterns
4. Consider increasing memory allocation

**Commands**:
```bash
# Check duration patterns
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "REPORT" --region eu-west-1 --start-time $(date -d '1 hour ago' +%s)000

# Check memory usage
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "Max Memory Used" --region eu-west-1
```

### 3. High Fallback Rate Response

**Trigger**: Fallback rate > 20% for 20 minutes

**Actions**:
1. Identify primary fallback reasons
2. Check external service health
3. Review API rate limits
4. Consider temporary service degradation

**Commands**:
```bash
# Check fallback reasons
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "Fallback activated" --region eu-west-1
```

## Health Checks

### Automated Health Monitoring

```bash
#!/bin/bash
# health-monitor.sh - Run every 5 minutes via cron

FUNCTION_NAME="trinity-ai-dev"
REGION="eu-west-1"
THRESHOLD_ERROR_RATE=5
THRESHOLD_DURATION=8000

# Check error rate (last 10 minutes)
ERROR_COUNT=$(aws logs filter-log-events \
  --log-group-name "/aws/lambda/$FUNCTION_NAME" \
  --filter-pattern "ERROR" \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --region $REGION \
  --query 'length(events)' --output text)

# Check average duration
AVG_DURATION=$(aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=$FUNCTION_NAME \
  --start-time $(date -d '10 minutes ago' --iso-8601) \
  --end-time $(date --iso-8601) \
  --period 600 \
  --statistics Average \
  --region $REGION \
  --query 'Datapoints[0].Average' --output text)

# Alert if thresholds exceeded
if [ "$ERROR_COUNT" -gt "$THRESHOLD_ERROR_RATE" ]; then
  echo "ALERT: High error rate detected: $ERROR_COUNT errors in 10 minutes"
fi

if [ "$(echo "$AVG_DURATION > $THRESHOLD_DURATION" | bc)" -eq 1 ]; then
  echo "ALERT: High latency detected: ${AVG_DURATION}ms average duration"
fi
```

### Synthetic Testing

```bash
#!/bin/bash
# synthetic-test.sh - Run every 15 minutes

# Test basic functionality
RESPONSE=$(aws lambda invoke \
  --function-name trinity-ai-dev \
  --cli-binary-format raw-in-base64-out \
  --payload '{"info":{"fieldName":"getChatRecommendations"},"arguments":{"text":"action movies","userId":"synthetic-test"}}' \
  --region eu-west-1 \
  /tmp/synthetic-response.json 2>&1)

if [ $? -eq 0 ]; then
  echo "✅ Synthetic test passed"
else
  echo "❌ Synthetic test failed: $RESPONSE"
  # Send alert
fi
```

## Performance Baselines

### Expected Performance Metrics

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Duration (Cold Start) | < 3s | > 5s | > 8s |
| Duration (Warm) | < 2s | > 4s | > 6s |
| Error Rate | < 2% | > 5% | > 10% |
| Memory Usage | < 300MB | > 400MB | > 450MB |
| AI Latency | < 3s | > 5s | > 8s |
| TMDB Latency | < 1s | > 2s | > 3s |
| Fallback Rate | < 10% | > 15% | > 25% |
| Confidence Score | > 0.7 | < 0.6 | < 0.5 |

### Capacity Planning

| Load Level | Requests/min | Expected Duration | Memory Usage |
|------------|--------------|-------------------|--------------|
| Low | 1-10 | 2-3s | 200-250MB |
| Medium | 10-50 | 3-4s | 250-300MB |
| High | 50-100 | 4-5s | 300-350MB |
| Peak | 100+ | 5-6s | 350-400MB |

## Troubleshooting Integration

### Alert Enrichment

Each alert includes:
- Direct links to CloudWatch logs
- Recent error patterns
- Performance trend data
- Suggested remediation steps

### Escalation Matrix

| Severity | Response Time | Escalation |
|----------|---------------|------------|
| Critical | 15 minutes | On-call engineer |
| Warning | 1 hour | Development team |
| Info | 4 hours | Team lead |

---

**Last Updated**: January 29, 2026
**Version**: Phase 11 Deployment
**Maintainer**: Trinity Development Team