import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';
import { TrinityDatabaseStack } from './trinity-database-stack';
import { TrinityLambdaStack } from './trinity-lambda-stack';
import { TrinityApiStack } from './trinity-api-stack';
import { TrinityCognitoStack } from './trinity-cognito-stack';
import { TrinityConfigStack } from './trinity-config-stack';

interface TrinityMainStackProps extends cdk.StackProps {
  config: TrinityEnvironmentConfig;
  databaseStack: TrinityDatabaseStack;
  lambdaStack: TrinityLambdaStack;
  cognitoStack: TrinityCognitoStack;
  apiStack: TrinityApiStack;
  configStack: TrinityConfigStack;
}

export class TrinityMainStack extends cdk.Stack {
  public readonly webBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: TrinityMainStackProps) {
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