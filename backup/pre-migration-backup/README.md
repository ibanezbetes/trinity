# Trinity Pre-Migration Backup

**Created:** January 31, 2026  
**Purpose:** Complete backup before Trinity Architectural Stabilization  
**Task:** 1. Pre-Migration Backup and Assessment  

## Backup Contents

### 1. Lambda Function Code Backup
- **Source:** All existing Lambda function code from `lambdas/` directory
- **MONOLITH Files:** Working code manually injected into AWS Console
- **Infrastructure Code:** Existing handlers in `infrastructure/src/` and `infrastructure/clean/src/`

### 2. AWS Resource Inventory
- **Lambda Functions:** 7 active functions
- **DynamoDB Tables:** 12 documented tables
- **GraphQL APIs:** 2 active APIs
- **Configuration:** Complete `.env` file backup

### 3. CDK Configuration
- **Infrastructure Code:** Complete CDK setup from `infrastructure/clean/`
- **Build Configuration:** Package.json, tsconfig, and build scripts

## Critical Working Code Locations

### MONOLITH Files (Working Console Code)
1. `MONOLITH-TRINITY-CACHE-FINAL.js` - Contains EnhancedTMDBClient with critical fixes
2. `MONOLITH-TRINITY-ROOM-FINAL.js` - Contains room creation logic with TMDB integration

### Lambda Directories
1. `lambdas/trinity-auth-dev/` - Authentication handler
2. `lambdas/trinity-cache-dev/` - Movie caching system
3. `lambdas/trinity-matchmaker-dev/` - Match detection logic
4. `lambdas/trinity-movie-dev/` - TMDB API integration
5. `lambdas/trinity-realtime-dev/` - WebSocket notifications
6. `lambdas/trinity-room-dev/` - Room management
7. `lambdas/trinity-vote-dev/` - Voting system

### Infrastructure Code
1. `infrastructure/src/handlers/` - Legacy handlers
2. `infrastructure/clean/src/handlers/` - CDK expected location
3. `infrastructure/clean/src/shared/` - Shared services

## AWS Resource Inventory (From .env)

### Lambda Functions
- trinity-auth-dev
- trinity-room-dev  
- trinity-vote-dev
- trinity-movie-dev
- trinity-cache-dev
- trinity-matchmaker-dev
- trinity-realtime-dev

### DynamoDB Tables
- trinity-users-dev
- trinity-rooms-dev
- trinity-room-members-dev
- trinity-votes-dev
- trinity-movies-cache-dev

### GraphQL APIs
- Main API: imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com
- Realtime API: imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com

### Cognito Configuration
- User Pool: eu-west-1_6UxioIj4z
- Client ID: 59dpqsm580j14ulkcha19shl64
- Domain: trinity-auth-dev.auth.eu-west-1.amazoncognito.com

## Critical Business Logic Preserved

### Western Languages Support
- **CRITICAL FIX:** MONOLITH files include Japanese ('ja') and Korean ('ko') languages
- **Location:** EnhancedTMDBClient class in both MONOLITH files

### Genre Mapping Logic
- **Movie to TV Genre Mapping:** Critical for cross-media type filtering
- **Location:** GENRE_MAPPING constant in EnhancedTMDBClient

### 50-Movie Caching System
- **Pre-caching Logic:** Room-specific movie caching with genre prioritization
- **Location:** ContentFilterService and caching logic in MONOLITH files

### Individual Voting System
- **Match Detection:** Based on room capacity requirements
- **Location:** Vote processing logic in lambda handlers

## Rollback Information

### Backup Locations
- **Complete Backup:** `backup/pre-migration-backup/`
- **MONOLITH Files:** Root directory (preserved)
- **Lambda Code:** `backup/pre-migration-backup/lambdas/`
- **Infrastructure:** `backup/pre-migration-backup/infrastructure/`
- **Configuration:** `backup/pre-migration-backup/.env.backup`

### Restoration Process
1. Restore Lambda function code from backup directories
2. Restore `.env` configuration from backup
3. Redeploy using existing deployment scripts
4. Verify all 7 Lambda functions are operational

## Next Steps
After this backup is complete, proceed with:
1. Destructive AWS Resource Cleanup (Task 2)
2. Code Consolidation and Migration (Task 3)
3. CDK Pipeline Repair (Task 4)