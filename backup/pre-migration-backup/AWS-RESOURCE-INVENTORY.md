# AWS Resource Inventory - Pre-Migration

**Date:** January 31, 2026  
**Region:** eu-west-1  
**Account:** 847850007406  

## Lambda Functions (7 Active)

### 1. trinity-auth-dev
- **Purpose:** User authentication and authorization
- **Runtime:** Node.js 18.x
- **Handler:** Handles user login, registration, token validation
- **Dependencies:** AWS Cognito integration
- **Code Location:** `lambdas/trinity-auth-dev/`

### 2. trinity-cache-dev  
- **Purpose:** Movie caching system with TMDB integration
- **Runtime:** Node.js 18.x
- **Handler:** Pre-caches 50 movies per room with genre prioritization
- **Dependencies:** TMDB API, DynamoDB
- **Code Location:** `lambdas/trinity-cache-dev/`
- **CRITICAL:** Contains EnhancedTMDBClient with Japanese/Korean language support

### 3. trinity-matchmaker-dev
- **Purpose:** Match detection based on room capacity
- **Runtime:** Node.js 18.x  
- **Handler:** Detects when all users in room vote "yes" for same content
- **Dependencies:** DynamoDB voting tables
- **Code Location:** `lambdas/trinity-matchmaker-dev/`

### 4. trinity-movie-dev
- **Purpose:** TMDB API integration and movie data management
- **Runtime:** Node.js 18.x
- **Handler:** Fetches movie/TV data from TMDB with filtering
- **Dependencies:** TMDB API
- **Code Location:** `lambdas/trinity-movie-dev/`

### 5. trinity-realtime-dev
- **Purpose:** Real-time notifications via WebSocket
- **Runtime:** Node.js 18.x
- **Handler:** Manages WebSocket connections for live updates
- **Dependencies:** AppSync GraphQL subscriptions
- **Code Location:** `lambdas/trinity-realtime-dev/`

### 6. trinity-room-dev
- **Purpose:** Room management and creation
- **Runtime:** Node.js 18.x
- **Handler:** Creates rooms, manages invites, triggers movie caching
- **Dependencies:** DynamoDB, Lambda invocation
- **Code Location:** `lambdas/trinity-room-dev/`
- **CRITICAL:** Contains room creation logic with TMDB integration

### 7. trinity-vote-dev
- **Purpose:** Individual voting system
- **Runtime:** Node.js 18.x
- **Handler:** Processes user votes, checks for matches
- **Dependencies:** DynamoDB, match detection
- **Code Location:** `lambdas/trinity-vote-dev/`

## DynamoDB Tables (12 Active)

### Core Tables
1. **trinity-users-dev** - User profiles and authentication data
2. **trinity-rooms-dev** - Room configuration and metadata  
3. **trinity-room-members-dev** - Room membership tracking
4. **trinity-votes-dev** - Individual user votes per room
5. **trinity-movies-cache-dev** - General movie cache

### Extended Tables (From Steering Guide)
6. **trinity-room-matches-dev** - Match results per room
7. **trinity-room-invites-dev-v2** - Room invitation system
8. **trinity-connections-dev** - WebSocket connection tracking
9. **trinity-room-movie-cache-dev** - Room-specific movie cache (TTL: 7 days)
10. **trinity-room-cache-metadata-dev** - Cache metadata per room
11. **trinity-matchmaking-dev** - Matchmaking algorithm data
12. **trinity-filter-cache** - TMDB filter cache

### Table Characteristics
- **Billing Mode:** PAY_PER_REQUEST
- **Region:** eu-west-1
- **TTL:** Configured on cache tables (7 days)

## GraphQL APIs (2 Active)

### 1. Main API (trinity-api-dev)
- **URL:** https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql
- **API ID:** epjtt2y3fzh53ii6omzj6n6h5a
- **Authentication:** AWS Cognito User Pools
- **Purpose:** Primary CRUD operations, room management, voting

### 2. Realtime API (trinity-realtime-api)
- **URL:** wss://imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql
- **Authentication:** API Key
- **Purpose:** Real-time subscriptions, match notifications, live updates

## AWS Cognito Configuration

### User Pool
- **ID:** eu-west-1_6UxioIj4z
- **Region:** eu-west-1
- **Client ID:** 59dpqsm580j14ulkcha19shl64
- **Domain:** trinity-auth-dev.auth.eu-west-1.amazoncognito.com

### Authentication Providers
- **Google OAuth:** Configured with web and mobile client IDs
- **Email/Password:** Native Cognito authentication
- **JWT:** Custom JWT handling with 24h expiration

## External API Integrations

### TMDB (The Movie Database)
- **API Key:** dc4dbcd2404c1ca852f8eb964add267d
- **Base URL:** https://api.themoviedb.org/3
- **Usage:** Movie/TV data fetching with western language filtering
- **Rate Limit:** 4 requests per second (250ms delay)

### Google OAuth
- **Web Client ID:** 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com
- **Android Client ID:** 230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com
- **Redirect URIs:** Configured for web and mobile

## CloudFormation Stacks

### Expected CDK Stacks (From infrastructure/clean/)
1. **TrinityMainStack** - Main orchestration stack
2. **TrinityDatabaseStack** - DynamoDB tables
3. **TrinityLambdaStack** - Lambda functions
4. **TrinityApiStack** - GraphQL APIs
5. **TrinityCognitoStack** - Authentication
6. **TrinityConfigStack** - Configuration management
7. **TrinityMatchmakingStack** - Match detection services

## IAM Roles and Policies

### Lambda Execution Roles
- **DynamoDB Access:** Read/Write permissions for all Trinity tables
- **Lambda Invocation:** Cross-function invocation permissions
- **AppSync Publishing:** Real-time notification permissions
- **CloudWatch Logs:** Logging and monitoring permissions

### AppSync Service Roles
- **DynamoDB Resolvers:** Direct table access for GraphQL operations
- **Lambda Resolvers:** Function invocation permissions

## Monitoring and Logging

### CloudWatch Configuration
- **Log Level:** info
- **Metrics:** Enabled for all Lambda functions
- **X-Ray Tracing:** Enabled for performance monitoring

### Performance Settings
- **Lambda Memory:** 512MB
- **Lambda Timeout:** 30 seconds
- **Circuit Breaker:** Configured with 5 failure threshold

## Critical Business Logic Locations

### EnhancedTMDBClient
- **Location:** MONOLITH-TRINITY-CACHE-FINAL.js, MONOLITH-TRINITY-ROOM-FINAL.js
- **Features:** Western language filtering (including ja/ko), genre mapping, rate limiting
- **Dependencies:** node-fetch, TMDB API

### ContentFilterService  
- **Location:** MONOLITH files and infrastructure/src/services/
- **Features:** Business logic validation, quality gates, description filtering

### 50-Movie Caching System
- **Location:** Room creation handlers and cache services
- **Features:** Genre prioritization, deterministic ordering, TTL management

### Individual Voting System
- **Location:** Vote handlers and matchmaking services
- **Features:** Capacity-based matching, real-time notifications

## Deployment Configuration

### Current Deployment Method
- **Manual Console Updates:** MONOLITH files manually injected
- **CDK Pipeline:** Broken, needs repair
- **Scripts:** Available in `scripts/` directory

### Environment
- **Stage:** dev
- **Node Environment:** development
- **Region:** eu-west-1 (ALWAYS)

## Security Configuration

### Secrets Management
- **JWT Secret:** trinity-mvp-super-secure-jwt-secret-key-2025-development
- **API Keys:** Stored in environment variables
- **AWS Credentials:** IAM roles and access keys

### Feature Flags
- **Real-time Notifications:** Enabled
- **Circuit Breaker:** Enabled  
- **Metrics Logging:** Enabled
- **Google Sign-in:** Enabled
- **Debug Mode:** Enabled (development)

## Backup Verification

### Code Backup Locations
- **Lambda Functions:** `backup/pre-migration-backup/lambdas/`
- **Infrastructure:** `backup/pre-migration-backup/infrastructure/`
- **MONOLITH Files:** `backup/pre-migration-backup/MONOLITH-*.js`
- **Configuration:** `backup/pre-migration-backup/.env.backup`

### Restoration Requirements
1. All 7 Lambda functions must be operational
2. All 12 DynamoDB tables must be accessible
3. Both GraphQL APIs must respond correctly
4. Cognito authentication must work
5. TMDB API integration must function
6. Real-time notifications must work

## Next Steps for Stabilization

### Phase 1: Destructive Cleanup
- Delete all existing CloudFormation stacks
- Remove all Lambda functions
- Delete all DynamoDB tables
- Clean up orphaned resources

### Phase 2: Code Consolidation
- Extract critical logic from MONOLITH files
- Consolidate into single source of truth
- Preserve all business logic and fixes

### Phase 3: CDK Pipeline Repair
- Fix dependency bundling issues
- Repair build configuration
- Enable successful deployment

### Phase 4: Fresh Deployment
- Deploy from clean CDK pipeline
- Verify all functionality preserved
- Validate against backup requirements