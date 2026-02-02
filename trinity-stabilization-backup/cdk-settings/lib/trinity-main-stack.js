"use strict";
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
exports.TrinityMainStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
class TrinityMainStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { databaseStack, lambdaStack, cognitoStack, apiStack } = props;
        // S3 Bucket for web assets
        this.webBucket = new s3.Bucket(this, 'trinity-web-assets', {
            bucketName: `trinity-web-assets-${this.account}-${this.region}`,
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
        });
        // CloudFront Origin Access Identity
        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'trinity-oai', {
            comment: 'Trinity web assets OAI',
        });
        // Grant CloudFront access to S3 bucket
        this.webBucket.grantRead(originAccessIdentity);
        // CloudFront Distribution
        this.distribution = new cloudfront.Distribution(this, 'trinity-distribution', {
            defaultBehavior: {
                origin: new origins.S3Origin(this.webBucket, {
                    originAccessIdentity,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                compress: true,
            },
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(5),
                },
            ],
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            enabled: true,
            comment: 'Trinity web application distribution',
        });
        // Cross-stack outputs for easy reference
        new cdk.CfnOutput(this, 'WebBucketName', {
            description: 'S3 bucket name for web assets',
            value: this.webBucket.bucketName,
            exportName: `${this.stackName}:WebBucketName`,
        });
        new cdk.CfnOutput(this, 'CloudFrontDomainName', {
            description: 'CloudFront distribution domain name',
            value: this.distribution.distributionDomainName,
            exportName: `${this.stackName}:CloudFrontDomainName`,
        });
        new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
            description: 'CloudFront distribution ID',
            value: this.distribution.distributionId,
            exportName: `${this.stackName}:CloudFrontDistributionId`,
        });
        // Summary output with all important endpoints
        new cdk.CfnOutput(this, 'TrinityEndpoints', {
            description: 'Trinity application endpoints summary',
            value: JSON.stringify({
                // TODO: Add API endpoints after fixing circular dependency
                // graphqlApi: apiStack.mainApi.graphqlUrl,
                // realtimeApi: apiStack.realtimeApi.graphqlUrl,
                webApp: `https://${this.distribution.distributionDomainName}`,
                userPoolId: cognitoStack.userPool.userPoolId,
                userPoolClientId: cognitoStack.userPoolClient.userPoolClientId,
                region: this.region,
            }),
        });
        // Add tags
        cdk.Tags.of(this).add('Project', 'Trinity');
        cdk.Tags.of(this).add('Environment', 'dev');
        cdk.Tags.of(this).add('Stack', 'Main');
    }
}
exports.TrinityMainStack = TrinityMainStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1tYWluLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJpbml0eS1tYWluLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1REFBeUM7QUFDekMsdUVBQXlEO0FBQ3pELDRFQUE4RDtBQW1COUQsTUFBYSxnQkFBaUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUk3QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTRCO1FBQ3BFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFckUsMkJBQTJCO1FBQzNCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUN6RCxVQUFVLEVBQUUsc0JBQXNCLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUMvRCxnQkFBZ0IsRUFBRSxLQUFLO1lBQ3ZCLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07WUFDdkMsU0FBUyxFQUFFLElBQUk7WUFDZixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsb0NBQW9DO1FBQ3BDLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxVQUFVLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNwRixPQUFPLEVBQUUsd0JBQXdCO1NBQ2xDLENBQUMsQ0FBQztRQUVILHVDQUF1QztRQUN2QyxJQUFJLENBQUMsU0FBUyxDQUFD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Q0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDekMsQ0FBQztDQUNGO0FBMUZELDRDQTBGQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XHJcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xyXG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBUcmluaXR5RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9jb25maWcvZW52aXJvbm1lbnRzJztcclxuaW1wb3J0IHsgVHJpbml0eURhdGFiYXNlU3RhY2sgfSBmcm9tICcuL3RyaW5pdHktZGF0YWJhc2Utc3RhY2snO1xyXG5pbXBvcnQgeyBUcmluaXR5TGFtYmRhU3RhY2sgfSBmcm9tICcuL3RyaW5pdHktbGFtYmRhLXN0YWNrJztcclxuaW1wb3J0IHsgVHJpbml0eUFwaVN0YWNrIH0gZnJvbSAnLi90cmluaXR5LWFwaS1zdGFjayc7XHJcbmltcG9ydCB7IFRyaW5pdHlDb2duaXRvU3RhY2sgfSBmcm9tICcuL3RyaW5pdHktY29nbml0by1zdGFjayc7XHJcbmltcG9ydCB7IFRyaW5pdHlDb25maWdTdGFjayB9IGZyb20gJy4vdHJpbml0eS1jb25maWctc3RhY2snO1xyXG5cclxuaW50ZXJmYWNlIFRyaW5pdHlNYWluU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICBjb25maWc6IFRyaW5pdHlFbnZpcm9ubWVudENvbmZpZztcclxuICBkYXRhYmFzZVN0YWNrOiBUcmluaXR5RGF0YWJhc2VTdGFjaztcclxuICBsYW1iZGFTdGFjazogVHJpbml0eUxhbWJkYVN0YWNrO1xyXG4gIGNvZ25pdG9TdGFjazogVHJpbml0eUNvZ25pdG9TdGFjaztcclxuICBhcGlTdGFjazogVHJpbml0eUFwaVN0YWNrO1xyXG4gIGNvbmZpZ1N0YWNrOiBUcmluaXR5Q29uZmlnU3RhY2s7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBUcmluaXR5TWFpblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgd2ViQnVja2V0OiBzMy5CdWNrZXQ7XHJcbiAgcHVibGljIHJlYWRvbmx5IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBUcmluaXR5TWFpblN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgZGF0YWJhc2VTdGFjaywgbGFtYmRhU3RhY2ssIGNvZ25pdG9TdGFjaywgYXBpU3RhY2sgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vIFMzIEJ1Y2tldCBmb3Igd2ViIGFzc2V0c1xyXG4gICAgdGhpcy53ZWJCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICd0cmluaXR5LXdlYi1hc3NldHMnLCB7XHJcbiAgICAgIGJ1Y2tldE5hbWU6IGB0cmluaXR5LXdlYi1hc3NldHMtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcclxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXHJcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcclxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxyXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDbG91ZEZyb250IE9yaWdpbiBBY2Nlc3MgSWRlbnRpdHlcclxuICAgIGNvbnN0IG9yaWdpbkFjY2Vzc0lkZW50aXR5ID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ3RyaW5pdHktb2FpJywge1xyXG4gICAgICBjb21tZW50OiAnVHJpbml0eSB3ZWIgYXNzZXRzIE9BSScsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFudCBDbG91ZEZyb250IGFjY2VzcyB0byBTMyBidWNrZXRcclxuICAgIHRoaXMud2ViQnVja2V0LmdyYW50UmVhZChvcmlnaW5BY2Nlc3NJZGVudGl0eSk7XHJcblxyXG4gICAgLy8gQ2xvdWRGcm9udCBEaXN0cmlidXRpb25cclxuICAgIHRoaXMuZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICd0cmluaXR5LWRpc3RyaWJ1dGlvbicsIHtcclxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XHJcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbih0aGlzLndlYkJ1Y2tldCwge1xyXG4gICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHksXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXHJcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfR0VUX0hFQURfT1BUSU9OUyxcclxuICAgICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNhY2hlZE1ldGhvZHMuQ0FDSEVfR0VUX0hFQURfT1BUSU9OUyxcclxuICAgICAgICBjb21wcmVzczogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcclxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXHJcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcclxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXHJcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXHJcbiAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgIGNvbW1lbnQ6ICdUcmluaXR5IHdlYiBhcHBsaWNhdGlvbiBkaXN0cmlidXRpb24nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3Jvc3Mtc3RhY2sgb3V0cHV0cyBmb3IgZWFzeSByZWZlcmVuY2VcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJCdWNrZXROYW1lJywge1xyXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGJ1Y2tldCBuYW1lIGZvciB3ZWIgYXNzZXRzJyxcclxuICAgICAgdmFsdWU6IHRoaXMud2ViQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfTpXZWJCdWNrZXROYW1lYCxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250RG9tYWluTmFtZScsIHtcclxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBkb21haW4gbmFtZScsXHJcbiAgICAgIHZhbHVlOiB0aGlzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lLFxyXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX06Q2xvdWRGcm9udERvbWFpbk5hbWVgLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkRnJvbnREaXN0cmlidXRpb25JZCcsIHtcclxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBJRCcsXHJcbiAgICAgIHZhbHVlOiB0aGlzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcclxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9OkNsb3VkRnJvbnREaXN0cmlidXRpb25JZGAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTdW1tYXJ5IG91dHB1dCB3aXRoIGFsbCBpbXBvcnRhbnQgZW5kcG9pbnRzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVHJpbml0eUVuZHBvaW50cycsIHtcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmluaXR5IGFwcGxpY2F0aW9uIGVuZHBvaW50cyBzdW1tYXJ5JyxcclxuICAgICAgdmFsdWU6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAvLyBUT0RPOiBBZGQgQVBJIGVuZHBvaW50cyBhZnRlciBmaXhpbmcgY2lyY3VsYXIgZGVwZW5kZW5jeVxyXG4gICAgICAgIC8vIGdyYXBocWxBcGk6IGFwaVN0YWNrLm1haW5BcGkuZ3JhcGhxbFVybCxcclxuICAgICAgICAvLyByZWFsdGltZUFwaTogYXBpU3RhY2sucmVhbHRpbWVBcGkuZ3JhcGhxbFVybCxcclxuICAgICAgICB3ZWJBcHA6IGBodHRwczovLyR7dGhpcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxyXG4gICAgICAgIHVzZXJQb29sSWQ6IGNvZ25pdG9TdGFjay51c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICAgIHVzZXJQb29sQ2xpZW50SWQ6IGNvZ25pdG9TdGFjay51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxyXG4gICAgICAgIHJlZ2lvbjogdGhpcy5yZWdpb24sXHJcbiAgICAgIH0pLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIHRhZ3NcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsICdUcmluaXR5Jyk7XHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50JywgJ2RldicpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdTdGFjaycsICdNYWluJyk7XHJcbiAgfVxyXG59Il19