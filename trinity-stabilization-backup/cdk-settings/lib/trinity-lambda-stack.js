"use strict";
/**
 * Trinity Lambda Stack
 * Defines all Lambda functions with TypeScript source code
 * Using regular Lambda functions to avoid Windows bundling issues
 */
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
exports.TrinityLambdaStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
class TrinityLambdaStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { config, tables } = props;
        // Initialize functions object
        this.functions = {};
        // Common Lambda configuration
        const commonEnvironment = {
            NODE_ENV: config.environment,
            TRINITY_ENV: config.environment,
            LOG_LEVEL: config.api.logLevel,
            // DynamoDB table names
            USERS_TABLE: tables.users.tableName,
            ROOMS_TABLE: tables.rooms.tableName,
            ROOM_MEMBERS_TABLE: tables.roomMembers.tableName,
            ROOM_INVITES_TABLE: tables.roomInvites.tableName,
            VOTES_TABLE: tables.votes.tableName,
            MOVIES_CACHE_TABLE: tables.moviesCache.tableName,
            ROOM_MATCHES_TABLE: tables.roomMatches.tableName,
            CONNECTIONS_TABLE: tables.connections.tableName,
            ROOM_MOVIE_CACHE_TABLE: tables.roomMovieCache.tableName,
            ROOM_CACHE_METADATA_TABLE: tables.roomCacheMetadata.tableName,
            MATCHMAKING_TABLE: tables.matchmaking.tableName,
            FILTER_CACHE_TABLE: tables.filterCache.tableName,
        };
        // Create Lambda functions using pre-built code (avoiding bundling issues)
        this.functions.auth = new lambda.Function(this, 'AuthFunction', {
            functionName: `trinity-auth-${config.environment}`,
            description: 'Trinity user authentication and authorization',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'auth-handler.handler',
            code: lambda.Code.fromAsset('src/handlers'), // Use compiled JS in src/handlers
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            architecture: lambda.Architecture.ARM_64,
            logRetention: logs.RetentionDays.ONE_WEEK,
            environment: commonEnvironment,
        });
        this.functions.room = new lambda.Function(this, 'RoomFunction', {
            functionName: `trinity-room-${config.environment}`,
            description: 'Trinity room management and movie cache integration',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'room-handler.handler',
            code: lambda.Code.fromAsset('src/handlers'),
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
            architecture: lambda.Architecture.ARM_64,
            logRetention: logs.RetentionDays.ONE_WEEK,
            environment: commonEnvironment,
        });
        this.functions.vote = new lambda.Function(this, 'VoteFunction', {
            functionName: `trinity-vote-${config.environment}`,
            description: 'Trinity individual voting and match detection',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'vote-handler.handler',
            code: lambda.Code.fromAsset('src/handlers'),
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            architecture: lambda.Architecture.ARM_64,
            logRetention: logs.RetentionDays.ONE_WEEK,
            environment: commonEnvironment,
        });
        this.functions.movie = new lambda.Function(this, 'MovieFunction', {
            functionName: `trinity-movie-${config.environment}`,
            description: 'Trinity TMDB integration and movie data management',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'movie-handler.handler',
            code: lambda.Code.fromAsset('src/handlers'),
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
            architecture: lambda.Architecture.ARM_64,
            logRetention: logs.RetentionDays.ONE_WEEK,
            environment: commonEnvironment,
        });
        this.functions.cache = new lambda.Function(this, 'CacheFunction', {
            functionName: `trinity-cache-${config.environment}`,
            description: 'Trinity movie caching with deterministic ordering',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'cache-handler.handler',
            code: lambda.Code.fromAsset('src/handlers'),
            timeout: cdk.Duration.minutes(5),
            memorySize: 1024,
            architecture: lambda.Architecture.ARM_64,
            logRetention: logs.RetentionDays.ONE_WEEK,
            environment: commonEnvironment,
        });
        this.functions.realtime = new lambda.Function(this, 'RealtimeFunction', {
            functionName: `trinity-realtime-${config.environment}`,
            description: 'Trinity real-time notifications and WebSocket management',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'realtime-handler.handler',
            code: lambda.Code.fromAsset('src/handlers'),
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            architecture: lambda.Architecture.ARM_64,
            logRetention: logs.RetentionDays.ONE_WEEK,
            environment: commonEnvironment,
        });
        this.functions.matchmaker = new lambda.Function(this, 'MatchmakerFunction', {
            // NOTE: This function is deployed as trinity-vote-consensus-dev in AWS (naming discrepancy)
            functionName: `trinity-vote-consensus-${config.environment}`,
            description: 'Trinity vote consensus detection via DynamoDB Streams',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'matchmaker-handler.handler',
            code: lambda.Code.fromAsset('src/handlers'),
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
            architecture: lambda.Architecture.ARM_64,
            logRetention: logs.RetentionDays.ONE_WEEK,
            environment: commonEnvironment,
        });
        // Create IAM role for Lambda functions
        const lambdaRole = new iam.Role(this, 'TrinityLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        // Add DynamoDB permissions (including Streams for matchmaker)
        const dynamoDbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
                'dynamodb:BatchGetItem',
                'dynamodb:BatchWriteItem',
                'dynamodb:TransactWriteItems',
                'dynamodb:TransactGetItems',
                'dynamodb:DescribeStream',
                'dynamodb:GetRecords',
                'dynamodb:GetShardIterator',
                'dynamodb:ListStreams',
            ],
            resources: [
                `arn:aws:dynamodb:${config.region}:${this.account}:table/trinity-*`,
                `arn:aws:dynamodb:${config.region}:${this.account}:table/trinity-*/index/*`,
                `arn:aws:dynamodb:${config.region}:${this.account}:table/trinity-*/stream/*`,
            ],
        });
        // Add AppSync permissions for real-time notifications
        const appSyncPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'appsync:GraphQL',
                'appsync:EvaluateCode',
                'appsync:EvaluateMappingTemplate',
            ],
            resources: [
                `arn:aws:appsync:${config.region}:${this.account}:apis/*`,
                `arn:aws:appsync:${config.region}:${this.account}:apis/*/types/*`,
                `arn:aws:appsync:${config.region}:${this.account}:apis/*/fields/*`,
            ],
        });
        // Add Systems Manager Parameter Store permissions
        const ssmPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:GetParametersByPath',
            ],
            resources: [
                `arn:aws:ssm:${config.region}:${this.account}:parameter/trinity/${config.environment}/*`,
            ],
        });
        // Add CloudWatch Logs permissions
        const logsPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
            ],
            resources: [
                `arn:aws:logs:${config.region}:${this.account}:log-group:/aws/lambda/trinity-*`,
            ],
        });
        // Attach policies to role
        lambdaRole.addToPolicy(dynamoDbPolicy);
        lambdaRole.addToPolicy(appSyncPolicy);
        lambdaRole.addToPolicy(ssmPolicy);
        lambdaRole.addToPolicy(logsPolicy);
        // Apply role to all functions
        const functionList = Object.values(this.functions);
        functionList.forEach(func => {
            // Override the default role
            const cfnFunction = func.node.defaultChild;
            cfnFunction.role = lambdaRole.roleArn;
        });
        // Add tags to all functions
        functionList.forEach(func => {
            cdk.Tags.of(func).add('Project', 'Trinity');
            cdk.Tags.of(func).add('Environment', config.environment);
            cdk.Tags.of(func).add('ManagedBy', 'CDK');
        });
        // Output function ARNs
        Object.entries(this.functions).forEach(([name, func]) => {
            new cdk.CfnOutput(this, `${name.charAt(0).toUpperCase() + name.slice(1)}FunctionArn`, {
                value: func.functionArn,
                description: `Trinity ${name.charAt(0).toUpperCase() + name.slice(1)} Function ARN`,
            });
        });
    }
}
exports.TrinityLambdaStack = TrinityLambdaStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1sYW1iZGEtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0cmluaXR5LWxhbWJkYS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7R0FJRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5REFBMkM7QUFDM0MsMkRBQTZDO0FBVTdDLE1BQWEsa0JBQW1CLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFHL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE4QjtRQUN0RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQztRQUVqQyw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFFcEIsOEJBQThCO1FBQzlCLE1BQU0saUJBQWlCLEdBQUc7WUFDeEIsUUFBUSxFQUFFLE1BQU0sQ0FBQyxXQUFXO1lBQzVCLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztZQUMvQixTQUFTLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRO1lBRTlCLHVCQUF1QjtZQUN2QixXQUFXLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxTQUFTO1lBQ25DLFdBQVcsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVM7WUFDbkMsa0JBQWtCLEVBQUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTO1lBQ2hELGtCQUFrQixFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUztZQUNoRCxXQUFXLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxTQUFTO1lBQ25DLGtCQUFrQixFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUztZQUNoRCxrQkFBa0IsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVM7WUFD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QUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdE9ELGdEQXNPQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBUcmluaXR5IExhbWJkYSBTdGFja1xyXG4gKiBEZWZpbmVzIGFsbCBMYW1iZGEgZnVuY3Rpb25zIHdpdGggVHlwZVNjcmlwdCBzb3VyY2UgY29kZVxyXG4gKiBVc2luZyByZWd1bGFyIExhbWJkYSBmdW5jdGlvbnMgdG8gYXZvaWQgV2luZG93cyBidW5kbGluZyBpc3N1ZXNcclxuICovXHJcblxyXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBUcmluaXR5RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9jb25maWcvZW52aXJvbm1lbnRzJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVHJpbml0eUxhbWJkYVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgY29uZmlnOiBUcmluaXR5RW52aXJvbm1lbnRDb25maWc7XHJcbiAgdGFibGVzOiBSZWNvcmQ8c3RyaW5nLCBjZGsuYXdzX2R5bmFtb2RiLlRhYmxlPjtcclxuICBwYXJhbWV0ZXJTdG9yZTogYW55O1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVHJpbml0eUxhbWJkYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgZnVuY3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBsYW1iZGEuRnVuY3Rpb24+O1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVHJpbml0eUxhbWJkYVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgY29uZmlnLCB0YWJsZXMgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vIEluaXRpYWxpemUgZnVuY3Rpb25zIG9iamVjdFxyXG4gICAgdGhpcy5mdW5jdGlvbnMgPSB7fTtcclxuXHJcbiAgICAvLyBDb21tb24gTGFtYmRhIGNvbmZpZ3VyYXRpb25cclxuICAgIGNvbnN0IGNvbW1vbkVudmlyb25tZW50ID0ge1xyXG4gICAgICBOT0RFX0VOVjogY29uZmlnLmVudmlyb25tZW50LFxyXG4gICAgICBUUklOSVRZX0VOVjogY29uZmlnLmVudmlyb25tZW50LFxyXG4gICAgICBMT0dfTEVWRUw6IGNvbmZpZy5hcGkubG9nTGV2ZWwsXHJcbiAgICAgIFxyXG4gICAgICAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lc1xyXG4gICAgICBVU0VSU19UQUJMRTogdGFibGVzLnVzZXJzLnRhYmxlTmFtZSxcclxuICAgICAgUk9PTVNfVEFCTEU6IHRhYmxlcy5yb29tcy50YWJsZU5hbWUsXHJcbiAgICAgIFJPT01fTUVNQkVSU19UQUJMRTogdGFibGVzLnJvb21NZW1iZXJzLnRhYmxlTmFtZSxcclxuICAgICAgUk9PTV9JTlZJVEVTX1RBQkxFOiB0YWJsZXMucm9vbUludml0ZXMudGFibGVOYW1lLFxyXG4gICAgICBWT1RFU19UQUJMRTogdGFibGVzLnZvdGVzLnRhYmxlTmFtZSxcclxuICAgICAgTU9WSUVTX0NBQ0hFX1RBQkxFOiB0YWJsZXMubW92aWVzQ2FjaGUudGFibGVOYW1lLFxyXG4gICAgICBST09NX01BVENIRVNfVEFCTEU6IHRhYmxlcy5yb29tTWF0Y2hlcy50YWJsZU5hbWUsXHJcbiAgICAgIENPTk5FQ1RJT05TX1RBQkxFOiB0YWJsZXMuY29ubmVjdGlvbnMudGFibGVOYW1lLFxyXG4gICAgICBST09NX01PVklFX0NBQ0hFX1RBQkxFOiB0YWJsZXMucm9vbU1vdmllQ2FjaGUudGFibGVOYW1lLFxyXG4gICAgICBST09NX0NBQ0hFX01FVEFEQVRBX1RBQkxFOiB0YWJsZXMucm9vbUNhY2hlTWV0YWRhdGEudGFibGVOYW1lLFxyXG4gICAgICBNQVRDSE1BS0lOR19UQUJMRTogdGFibGVzLm1hdGNobWFraW5nLnRhYmxlTmFtZSxcclxuICAgICAgRklMVEVSX0NBQ0hFX1RBQkxFOiB0YWJsZXMuZmlsdGVyQ2FjaGUudGFibGVOYW1lLFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9ucyB1c2luZyBwcmUtYnVpbHQgY29kZSAoYXZvaWRpbmcgYnVuZGxpbmcgaXNzdWVzKVxyXG4gICAgdGhpcy5mdW5jdGlvbnMuYXV0aCA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0F1dGhGdW5jdGlvbicsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgdHJpbml0eS1hdXRoLSR7Y29uZmlnLmVudmlyb25tZW50fWAsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpbml0eSB1c2VyIGF1dGhlbnRpY2F0aW9uIGFuZCBhdXRob3JpemF0aW9uJyxcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdhdXRoLWhhbmRsZXIuaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnc3JjL2hhbmRsZXJzJyksIC8vIFVzZSBjb21waWxlZCBKUyBpbiBzcmMvaGFuZGxlcnNcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIGFyY2hpdGVjdHVyZTogbGFtYmRhLkFyY2hpdGVjdHVyZS5BUk1fNjQsXHJcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmZ1bmN0aW9ucy5yb29tID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUm9vbUZ1bmN0aW9uJywge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6IGB0cmluaXR5LXJvb20tJHtjb25maWcuZW52aXJvbm1lbnR9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmluaXR5IHJvb20gbWFuYWdlbWVudCBhbmQgbW92aWUgY2FjaGUgaW50ZWdyYXRpb24nLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgaGFuZGxlcjogJ3Jvb20taGFuZGxlci5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdzcmMvaGFuZGxlcnMnKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIGFyY2hpdGVjdHVyZTogbGFtYmRhLkFyY2hpdGVjdHVyZS5BUk1fNjQsXHJcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmZ1bmN0aW9ucy52b3RlID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVm90ZUZ1bmN0aW9uJywge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6IGB0cmluaXR5LXZvdGUtJHtjb25maWcuZW52aXJvbm1lbnR9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmluaXR5IGluZGl2aWR1YWwgdm90aW5nIGFuZCBtYXRjaCBkZXRlY3Rpb24nLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgaGFuZGxlcjogJ3ZvdGUtaGFuZGxlci5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdzcmMvaGFuZGxlcnMnKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIGFyY2hpdGVjdHVyZTogbGFtYmRhLkFyY2hpdGVjdHVyZS5BUk1fNjQsXHJcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmZ1bmN0aW9ucy5tb3ZpZSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01vdmllRnVuY3Rpb24nLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHRyaW5pdHktbW92aWUtJHtjb25maWcuZW52aXJvbm1lbnR9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmluaXR5IFRNREIgaW50ZWdyYXRpb24gYW5kIG1vdmllIGRhdGEgbWFuYWdlbWVudCcsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxyXG4gICAgICBoYW5kbGVyOiAnbW92aWUtaGFuZGxlci5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdzcmMvaGFuZGxlcnMnKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIGFyY2hpdGVjdHVyZTogbGFtYmRhLkFyY2hpdGVjdHVyZS5BUk1fNjQsXHJcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmZ1bmN0aW9ucy5jYWNoZSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NhY2hlRnVuY3Rpb24nLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHRyaW5pdHktY2FjaGUtJHtjb25maWcuZW52aXJvbm1lbnR9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmluaXR5IG1vdmllIGNhY2hpbmcgd2l0aCBkZXRlcm1pbmlzdGljIG9yZGVyaW5nJyxcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdjYWNoZS1oYW5kbGVyLmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ3NyYy9oYW5kbGVycycpLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcclxuICAgICAgYXJjaGl0ZWN0dXJlOiBsYW1iZGEuQXJjaGl0ZWN0dXJlLkFSTV82NCxcclxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudCxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuZnVuY3Rpb25zLnJlYWx0aW1lID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVhbHRpbWVGdW5jdGlvbicsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgdHJpbml0eS1yZWFsdGltZS0ke2NvbmZpZy5lbnZpcm9ubWVudH1gLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgcmVhbC10aW1lIG5vdGlmaWNhdGlvbnMgYW5kIFdlYlNvY2tldCBtYW5hZ2VtZW50JyxcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdyZWFsdGltZS1oYW5kbGVyLmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ3NyYy9oYW5kbGVycycpLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcclxuICAgICAgYXJjaGl0ZWN0dXJlOiBsYW1iZGEuQXJjaGl0ZWN0dXJlLkFSTV82NCxcclxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudCxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuZnVuY3Rpb25zLm1hdGNobWFrZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdNYXRjaG1ha2VyRnVuY3Rpb24nLCB7XHJcbiAgICAgIC8vIE5PVEU6IFRoaXMgZnVuY3Rpb24gaXMgZGVwbG95ZWQgYXMgdHJpbml0eS12b3RlLWNvbnNlbnN1cy1kZXYgaW4gQVdTIChuYW1pbmcgZGlzY3JlcGFuY3kpXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHRyaW5pdHktdm90ZS1jb25zZW5zdXMtJHtjb25maWcuZW52aXJvbm1lbnR9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmluaXR5IHZvdGUgY29uc2Vuc3VzIGRldGVjdGlvbiB2aWEgRHluYW1vREIgU3RyZWFtcycsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxyXG4gICAgICBoYW5kbGVyOiAnbWF0Y2htYWtlci1oYW5kbGVyLmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ3NyYy9oYW5kbGVycycpLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcclxuICAgICAgYXJjaGl0ZWN0dXJlOiBsYW1iZGEuQXJjaGl0ZWN0dXJlLkFSTV82NCxcclxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBJQU0gcm9sZSBmb3IgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gICAgY29uc3QgbGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVHJpbml0eUxhbWJkYVJvbGUnLCB7XHJcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxyXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcclxuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBEeW5hbW9EQiBwZXJtaXNzaW9ucyAoaW5jbHVkaW5nIFN0cmVhbXMgZm9yIG1hdGNobWFrZXIpXHJcbiAgICBjb25zdCBkeW5hbW9EYlBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxyXG4gICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcclxuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nLFxyXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxyXG4gICAgICAgICdkeW5hbW9kYjpCYXRjaEdldEl0ZW0nLFxyXG4gICAgICAgICdkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOlRyYW5zYWN0V3JpdGVJdGVtcycsXHJcbiAgICAgICAgJ2R5bmFtb2RiOlRyYW5zYWN0R2V0SXRlbXMnLFxyXG4gICAgICAgICdkeW5hbW9kYjpEZXNjcmliZVN0cmVhbScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOkdldFJlY29yZHMnLFxyXG4gICAgICAgICdkeW5hbW9kYjpHZXRTaGFyZEl0ZXJhdG9yJyxcclxuICAgICAgICAnZHluYW1vZGI6TGlzdFN0cmVhbXMnLFxyXG4gICAgICBdLFxyXG4gICAgICByZXNvdXJjZXM6IFtcclxuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS90cmluaXR5LSpgLFxyXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7Y29uZmlnLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL3RyaW5pdHktKi9pbmRleC8qYCxcclxuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS90cmluaXR5LSovc3RyZWFtLypgLFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIEFwcFN5bmMgcGVybWlzc2lvbnMgZm9yIHJlYWwtdGltZSBub3RpZmljYXRpb25zXHJcbiAgICBjb25zdCBhcHBTeW5jUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAnYXBwc3luYzpHcmFwaFFMJyxcclxuICAgICAgICAnYXBwc3luYzpFdmFsdWF0ZUNvZGUnLFxyXG4gICAgICAgICdhcHBzeW5jOkV2YWx1YXRlTWFwcGluZ1RlbXBsYXRlJyxcclxuICAgICAgXSxcclxuICAgICAgcmVzb3VyY2VzOiBbXHJcbiAgICAgICAgYGFybjphd3M6YXBwc3luYzoke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTphcGlzLypgLFxyXG4gICAgICAgIGBhcm46YXdzOmFwcHN5bmM6JHtjb25maWcucmVnaW9ufToke3RoaXMuYWNjb3VudH06YXBpcy8qL3R5cGVzLypgLFxyXG4gICAgICAgIGBhcm46YXdzOmFwcHN5bmM6JHtjb25maWcucmVnaW9ufToke3RoaXMuYWNjb3VudH06YXBpcy8qL2ZpZWxkcy8qYCxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBTeXN0ZW1zIE1hbmFnZXIgUGFyYW1ldGVyIFN0b3JlIHBlcm1pc3Npb25zXHJcbiAgICBjb25zdCBzc21Qb2xpY3kgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICdzc206R2V0UGFyYW1ldGVyJyxcclxuICAgICAgICAnc3NtOkdldFBhcmFtZXRlcnMnLFxyXG4gICAgICAgICdzc206R2V0UGFyYW1ldGVyc0J5UGF0aCcsXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlc291cmNlczogW1xyXG4gICAgICAgIGBhcm46YXdzOnNzbToke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpwYXJhbWV0ZXIvdHJpbml0eS8ke2NvbmZpZy5lbnZpcm9ubWVudH0vKmAsXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXHJcbiAgICBjb25zdCBsb2dzUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXHJcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcclxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnLFxyXG4gICAgICBdLFxyXG4gICAgICByZXNvdXJjZXM6IFtcclxuICAgICAgICBgYXJuOmF3czpsb2dzOiR7Y29uZmlnLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS90cmluaXR5LSpgLFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQXR0YWNoIHBvbGljaWVzIHRvIHJvbGVcclxuICAgIGxhbWJkYVJvbGUuYWRkVG9Qb2xpY3koZHluYW1vRGJQb2xpY3kpO1xyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShhcHBTeW5jUG9saWN5KTtcclxuICAgIGxhbWJkYVJvbGUuYWRkVG9Qb2xpY3koc3NtUG9saWN5KTtcclxuICAgIGxhbWJkYVJvbGUuYWRkVG9Qb2xpY3kobG9nc1BvbGljeSk7XHJcblxyXG4gICAgLy8gQXBwbHkgcm9sZSB0byBhbGwgZnVuY3Rpb25zXHJcbiAgICBjb25zdCBmdW5jdGlvbkxpc3QgPSBPYmplY3QudmFsdWVzKHRoaXMuZnVuY3Rpb25zKTtcclxuXHJcbiAgICBmdW5jdGlvbkxpc3QuZm9yRWFjaChmdW5jID0+IHtcclxuICAgICAgLy8gT3ZlcnJpZGUgdGhlIGRlZmF1bHQgcm9sZVxyXG4gICAgICBjb25zdCBjZm5GdW5jdGlvbiA9IGZ1bmMubm9kZS5kZWZhdWx0Q2hpbGQgYXMgbGFtYmRhLkNmbkZ1bmN0aW9uO1xyXG4gICAgICBjZm5GdW5jdGlvbi5yb2xlID0gbGFtYmRhUm9sZS5yb2xlQXJuO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIHRhZ3MgdG8gYWxsIGZ1bmN0aW9uc1xyXG4gICAgZnVuY3Rpb25MaXN0LmZvckVhY2goZnVuYyA9PiB7XHJcbiAgICAgIGNkay5UYWdzLm9mKGZ1bmMpLmFkZCgnUHJvamVjdCcsICdUcmluaXR5Jyk7XHJcbiAgICAgIGNkay5UYWdzLm9mKGZ1bmMpLmFkZCgnRW52aXJvbm1lbnQnLCBjb25maWcuZW52aXJvbm1lbnQpO1xyXG4gICAgICBjZGsuVGFncy5vZihmdW5jKS5hZGQoJ01hbmFnZWRCeScsICdDREsnKTtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE91dHB1dCBmdW5jdGlvbiBBUk5zXHJcbiAgICBPYmplY3QuZW50cmllcyh0aGlzLmZ1bmN0aW9ucykuZm9yRWFjaCgoW25hbWUsIGZ1bmNdKSA9PiB7XHJcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIGAke25hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpfUZ1bmN0aW9uQXJuYCwge1xyXG4gICAgICAgIHZhbHVlOiBmdW5jLmZ1bmN0aW9uQXJuLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgVHJpbml0eSAke25hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpfSBGdW5jdGlvbiBBUk5gLFxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG4gIH1cclxufSJdfQ==