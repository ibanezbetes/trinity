# Trinity Real-Time Matchmaking Deployment

This script deploys the Trinity Real-Time Matchmaking system implementing the Virtual Waiting Room pattern with Single Table Design and Event-Driven Architecture.

## Architecture Overview

```
Client Mutation → AppSync → DynamoDB → Stream → Lambda → AppSync Mutation → Subscription
```

## EARS Requirements Implementation

### 1. **Ubiquitous Requirement**: Enhanced Subscription Filtering
- AppSync subscriptions with server-side filtering
- Only clients subscribed to specific `roomId` receive updates
- Implemented in `api/resolvers/onRoomStatusChange.js`

### 2. **Event-Driven Ingestion**: TransactWriteItems
- `joinRoom` mutation uses atomic transactions
- Increments `CurrentCount` and creates `UserSession` record
- Fails if `CurrentCount >= MaxPlayers` or `Status != OPEN`
- Implemented in `api/resolvers/joinRoom.js`

### 3. **State-Driven Status**: Room Status Management
- Room status remains `OPEN` while `currentCount < maxPlayers`
- Automatic status correction via DynamoDB Streams
- Implemented in `lambdas/trinity-matchmaker-dev/index.js`

### 4. **State-Driven Matchmaking**: Capacity-Based Triggering
- When `CurrentCount` reaches capacity, Lambda triggers matchmaking
- Transitions room status to `READY/LOCKED`
- Publishes `publishMatchReady` mutation via IAM authorization
- Implemented in `lambdas/trinity-matchmaker-dev/index.js`

### 5. **Unwanted Behavior**: Room Full Error Handling
- `TransactionCanceledException` caught and converted to `RoomFullError`
- Structured error response with current capacity information
- Implemented in `api/resolvers/joinRoom.js`

### 6. **Security**: IAM-Protected Backend Mutations
- `publishMatchReady` mutation protected by `@aws_iam` directive
- Only backend Lambda can trigger match ready events
- Implemented in `api/resolvers/publishMatchReady.js`

## Single Table Design Schema

### Table: `trinity-matchmaking-dev`

| PK | SK | Attributes | Purpose |
|----|----|------------|---------|
| `ROOM#<id>` | `METADATA` | `currentCount`, `maxPlayers`, `status` | Room metadata with atomic counters |
| `ROOM#<id>` | `USER#<id>` | `joinedAt`, `status` | User session records |
| `EVENT#<id>` | `MATCH_READY#<timestamp>` | `matchData`, `publishedAt` | Match events (TTL enabled) |

### GSI1: User-Centric Queries
- **GSI1PK**: `USER#<id>`
- **GSI1SK**: `ROOM#<id>`
- **Purpose**: Query user's room history and active sessions

## Deployment

### Prerequisites
- Node.js 18+
- AWS CLI configured
- AWS CDK v2 installed
- Proper IAM permissions for DynamoDB, Lambda, AppSync

### Quick Deploy
```bash
node scripts/deploy-matchmaking/deploy-matchmaking.js
```

### Manual Deploy Steps
```bash
# 1. Install dependencies
cd infrastructure/clean
npm install

cd ../../lambdas/trinity-matchmaker-dev
npm install

# 2. Run tests
npm test

# 3. Deploy infrastructure
cd ../../infrastructure/clean
cdk deploy TrinityMatchmakingStack --require-approval never

# 4. Verify deployment
aws dynamodb describe-table --table-name trinity-matchmaking-dev --region eu-west-1
aws lambda get-function --function-name trinity-matchmaker-dev --region eu-west-1
```

## Testing

### Property-Based Tests
```bash
cd lambdas/trinity-matchmaker-dev
npm test
```

Tests cover:
- **Capacity Constraint Enforcement**: Room limits are always respected
- **State Transition Consistency**: Status changes follow defined state machine
- **Event Processing Idempotency**: Duplicate events handled safely
- **Subscription Filtering Accuracy**: Events reach correct subscribers only
- **Performance Characteristics**: Processing within acceptable time bounds

### Integration Testing
```bash
# Test room creation and joining
node scripts/test-matchmaking/test-room-joining.js

# Test real-time subscriptions
node scripts/test-matchmaking/test-subscriptions.js

# Test capacity limits
node scripts/test-matchmaking/test-capacity-limits.js
```

## Monitoring

### CloudWatch Metrics
- **Lambda Errors**: `trinity-matchmaker-dev` function errors
- **DynamoDB Throttling**: `trinity-matchmaking-dev` table throttling
- **AppSync Requests**: Real-time subscription metrics

### CloudWatch Logs
- **Lambda Logs**: `/aws/lambda/trinity-matchmaker-dev`
- **AppSync Logs**: Real-time resolver execution logs

### Alarms
- Matchmaker Lambda errors > 5 in 5 minutes
- DynamoDB throttling > 0
- AppSync subscription failures

## Usage Examples

### Client-Side GraphQL

#### Join Room
```graphql
mutation JoinRoom($input: JoinRoomInput!) {
  joinRoom(input: $input) {
    ... on MatchmakingRoom {
      id
      currentCount
      maxPlayers
      status
    }
    ... on RoomFullError {
      message
      errorCode
      currentCount
      maxPlayers
    }
  }
}
```

#### Subscribe to Room Updates
```graphql
subscription OnRoomStatusChange($roomId: ID!) {
  onRoomStatusChange(roomId: $roomId) {
    id
    status
    currentCount
    maxPlayers
  }
}
```

#### Subscribe to Match Ready
```graphql
subscription OnMatchReady($roomId: ID!) {
  onMatchReady(roomId: $roomId) {
    roomId
    participants {
      userId
      joinedAt
      status
    }
    matchedAt
  }
}
```

## Troubleshooting

### Common Issues

#### 1. DynamoDB TransactionCanceledException
- **Cause**: Room is full or user already joined
- **Solution**: Handle `RoomFullError` in client code
- **Check**: Room capacity and user session status

#### 2. Lambda Timeout
- **Cause**: AppSync mutation call taking too long
- **Solution**: Increase Lambda timeout or optimize AppSync call
- **Check**: CloudWatch logs for performance metrics

#### 3. Subscription Not Receiving Updates
- **Cause**: Subscription filtering not working
- **Solution**: Verify `roomId` parameter in subscription
- **Check**: AppSync real-time logs

#### 4. Stream Processing Delays
- **Cause**: DynamoDB Stream lag or Lambda cold starts
- **Solution**: Monitor stream metrics and consider provisioned concurrency
- **Check**: DynamoDB Stream metrics and Lambda duration

### Debug Commands
```bash
# Check table status
aws dynamodb describe-table --table-name trinity-matchmaking-dev --region eu-west-1

# Check Lambda function
aws lambda get-function --function-name trinity-matchmaker-dev --region eu-west-1

# View recent logs
aws logs tail /aws/lambda/trinity-matchmaker-dev --follow --region eu-west-1

# Test Lambda directly
aws lambda invoke --function-name trinity-matchmaker-dev \
  --payload file://test-event.json \
  --region eu-west-1 response.json
```

## Performance Characteristics

### Expected Latency
- **Room Join**: < 200ms (AppSync + DynamoDB transaction)
- **Match Trigger**: < 500ms (Stream + Lambda + AppSync)
- **Subscription Delivery**: < 100ms (AppSync real-time)

### Scalability Limits
- **Concurrent Rooms**: 10,000+ (DynamoDB auto-scaling)
- **Users per Room**: Configurable (default 4, max 100)
- **Stream Processing**: 1,000 events/second per shard

### Cost Optimization
- **DynamoDB**: PAY_PER_REQUEST billing
- **Lambda**: Only charged during stream processing
- **AppSync**: Per request and real-time connection pricing
- **TTL**: Automatic cleanup reduces storage costs

## Security Considerations

### IAM Permissions
- Lambda execution role has minimal DynamoDB and AppSync permissions
- AppSync resolvers use Cognito JWT for user authentication
- Backend mutations protected by IAM authorization

### Data Protection
- All data encrypted in transit (HTTPS/WSS)
- DynamoDB encryption at rest enabled
- TTL configured for automatic data cleanup

### Rate Limiting
- AppSync has built-in rate limiting
- DynamoDB auto-scaling prevents throttling
- Lambda concurrency limits prevent runaway costs

## Migration from Existing System

### Compatibility
- New matchmaking system runs alongside existing room system
- Gradual migration possible by feature flag
- Existing room data preserved

### Migration Steps
1. Deploy new matchmaking infrastructure
2. Update mobile app to use new mutations (feature flagged)
3. Test with subset of users
4. Gradually migrate all users
5. Deprecate old room joining logic

## Future Enhancements

### Planned Features
- **Advanced Matching**: Skill-based matchmaking algorithms
- **Room Templates**: Pre-configured room types
- **Analytics**: Detailed matchmaking metrics and insights
- **Multi-Region**: Cross-region room joining support

### Extensibility
- Single Table Design allows easy addition of new entity types
- Event-driven architecture supports additional processing workflows
- AppSync subscriptions can be extended for new real-time features