/**
 * Infrastructure Analyzer Adapter
 * Infrastructure adapter for analyzing AWS CDK and infrastructure components
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { IInfrastructureAnalyzer } from '../../domain/services/analysis-engine.interface';
import {
  CDKStackInfo,
  AWSResourceInfo,
  CostEstimate,
  CDKResourceInfo,
  CDKOutputInfo,
  CDKParameterInfo,
  CDKConditionInfo,
  ResourceCost,
  CostBreakdown,
  ResourceUsage,
  CostOptimizationRecommendation,
} from '../../domain/entities/analysis.entity';

@Injectable()
export class InfrastructureAnalyzerAdapter implements IInfrastructureAnalyzer {
  private readonly logger = new Logger(InfrastructureAnalyzerAdapter.name);

  async analyzeCDKStacks(cdkPath: string): Promise<CDKStackInfo[]> {
    this.logger.log(`Analyzing CDK stacks in path: ${cdkPath}`);

    try {
      const stacks: CDKStackInfo[] = [];
      await this.scanCDKFiles(cdkPath, stacks);

      this.logger.log(`Found ${stacks.length} CDK stacks`);
      return stacks;
    } catch (error) {
      this.logger.error(`Failed to analyze CDK stacks: ${error.message}`, error.stack);
      throw new Error(`Failed to analyze CDK stacks: ${error.message}`);
    }
  }

  async analyzeAWSResources(cdkStacks: CDKStackInfo[]): Promise<AWSResourceInfo[]> {
    this.logger.log(`Analyzing AWS resources from ${cdkStacks.length} CDK stacks`);

    try {
      const resources: AWSResourceInfo[] = [];

      for (const stack of cdkStacks) {
        for (const resource of stack.resources) {
          const awsResource = await this.convertCDKResourceToAWSResource(resource, stack);
          if (awsResource) {
            resources.push(awsResource);
          }
        }
      }

      this.logger.log(`Analyzed ${resources.length} AWS resources`);
      return resources;
    } catch (error) {
      this.logger.error(`Failed to analyze AWS resources: ${error.message}`, error.stack);
      throw new Error(`Failed to analyze AWS resources: ${error.message}`);
    }
  }

  async estimateCosts(resources: AWSResourceInfo[]): Promise<CostEstimate> {
    this.logger.log(`Estimating costs for ${resources.length} AWS resources`);

    try {
      let totalMonthlyCost = 0;
      const byService: Record<string, ResourceCost> = {};
      const byRegion: Record<string, ResourceCost> = {};
      const optimizationRecommendations: CostOptimizationRecommendation[] = [];

      for (const resource of resources) {
        const resourceCost = this.calculateResourceCost(resource);
        totalMonthlyCost += resourceCost.monthly;

        // Group by service
        const serviceName = this.extractServiceName(resource.type);
        if (!byService[serviceName]) {
          byService[serviceName] = {
            monthly: 0,
            yearly: 0,
            currency: 'USD',
            breakdown: [],
          };
        }
        byService[serviceName].monthly += resourceCost.monthly;
        byService[serviceName].yearly += resourceCost.yearly;

        // Group by region
        if (!byRegion[resource.region]) {
          byRegion[resource.region] = {
            monthly: 0,
            yearly: 0,
            currency: 'USD',
            breakdown: [],
          };
        }
        byRegion[resource.region].monthly += resourceCost.monthly;
        byRegion[resource.region].yearly += resourceCost.yearly;

        // Generate optimization recommendations
        const recommendations = this.generateCostOptimizationRecommendations(resource);
        optimizationRecommendations.push(...recommendations);
      }

      const total: ResourceCost = {
        monthly: totalMonthlyCost,
        yearly: totalMonthlyCost * 12,
        currency: 'USD',
        breakdown: this.createCostBreakdown(byService),
      };

      const costEstimate: CostEstimate = {
        total,
        byService,
        byRegion,
        optimizationRecommendations,
      };

      this.logger.log(`Cost estimation completed: $${totalMonthlyCost.toFixed(2)}/month`);
      return costEstimate;
    } catch (error) {
      this.logger.error(`Failed to estimate costs: ${error.message}`, error.stack);
      throw new Error(`Failed to estimate costs: ${error.message}`);
    }
  }

  private async scanCDKFiles(dirPath: string, stacks: CDKStackInfo[], depth = 0): Promise<void> {
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(entry.name)) continue;
          await this.scanCDKFiles(fullPath, stacks, depth + 1);
        } else if (entry.isFile() && this.isCDKFile(entry.name)) {
          const stackInfo = await this.analyzeCDKFile(fullPath);
          if (stackInfo) {
            stacks.push(stackInfo);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan CDK directory ${dirPath}: ${error.message}`);
    }
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', 'cdk.out'];
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  private isCDKFile(fileName: string): boolean {
    return (fileName.endsWith('.ts') || fileName.endsWith('.js')) &&
           (fileName.includes('stack') || fileName.includes('Stack') ||
            fileName.includes('construct') || fileName.includes('Construct'));
  }

  private async analyzeCDKFile(filePath: string): Promise<CDKStackInfo | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check if this is actually a CDK stack file
      if (!this.isCDKStackFile(content)) return null;

      const stackName = this.extractStackName(content, filePath);
      const resources = this.extractCDKResources(content);
      const dependencies = this.extractStackDependencies(content);
      const outputs = this.extractCDKOutputs(content);
      const parameters = this.extractCDKParameters(content);
      const conditions = this.extractCDKConditions(content);
      const metadata = this.extractStackMetadata(content);

      const stackInfo: CDKStackInfo = {
        name: stackName,
        path: filePath,
        resources,
        dependencies,
        outputs,
        parameters,
        conditions,
        metadata,
      };

      return stackInfo;
    } catch (error) {
      this.logger.warn(`Failed to analyze CDK file ${filePath}: ${error.message}`);
      return null;
    }
  }

  private isCDKStackFile(content: string): boolean {
    return content.includes('import') && 
           (content.includes('@aws-cdk') || content.includes('aws-cdk-lib')) &&
           (content.includes('Stack') || content.includes('Construct'));
  }

  private extractStackName(content: string, filePath: string): string {
    // Try to extract from class declaration
    const classMatch = content.match(/class\s+(\w+Stack)\s+extends/);
    if (classMatch) {
      return classMatch[1];
    }

    // Try to extract from constructor or export
    const constructorMatch = content.match(/constructor.*?(\w+Stack)/);
    if (constructorMatch) {
      return constructorMatch[1];
    }

    // Fall back to filename
    return path.basename(filePath, path.extname(filePath));
  }

  private extractCDKResources(content: string): CDKResourceInfo[] {
    const resources: CDKResourceInfo[] = [];

    // This is a simplified extraction - in reality, you'd need more sophisticated parsing
    // Look for common CDK resource patterns
    const resourcePatterns = [
      /new\s+(\w+\.\w+)\s*\(\s*this\s*,\s*['"]([^'"]+)['"]/g,
      /new\s+(\w+)\s*\(\s*this\s*,\s*['"]([^'"]+)['"]/g,
    ];

    for (const pattern of resourcePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const resourceType = match[1];
        const logicalId = match[2];

        // Skip if this doesn't look like an AWS resource
        if (!this.isAWSResourceType(resourceType)) continue;

        resources.push({
          logicalId,
          type: resourceType,
          properties: this.extractResourceProperties(content, match.index),
          dependencies: this.extractResourceDependencies(content, match.index),
          metadata: {},
        });
      }
    }

    return resources;
  }

  private isAWSResourceType(resourceType: string): boolean {
    const awsResourcePrefixes = [
      'aws-', 'AWS', 'Lambda', 'DynamoDB', 'S3', 'CloudFormation',
      'ApiGateway', 'Cognito', 'AppSync', 'CloudWatch', 'IAM',
      'EC2', 'ECS', 'RDS', 'SQS', 'SNS', 'CloudFront'
    ];

    return awsResourcePrefixes.some(prefix => resourceType.includes(prefix));
  }

  private extractResourceProperties(content: string, resourceIndex: number): Record<string, any> {
    // This is a simplified implementation
    // In reality, you'd need to parse the constructor parameters and property assignments
    return {};
  }

  private extractResourceDependencies(content: string, resourceIndex: number): string[] {
    // This is a simplified implementation
    // In reality, you'd need to analyze variable references and dependencies
    return [];
  }

  private extractStackDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      if (match[1].startsWith('@aws-cdk') || match[1].startsWith('aws-cdk-lib')) {
        dependencies.push(match[1]);
      }
    }

    return [...new Set(dependencies)];
  }

  private extractCDKOutputs(content: string): CDKOutputInfo[] {
    const outputs: CDKOutputInfo[] = [];
    const outputRegex = /new\s+CfnOutput\s*\(\s*this\s*,\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = outputRegex.exec(content)) !== null) {
      outputs.push({
        logicalId: match[1],
        value: 'unknown', // Would need more sophisticated parsing
        description: undefined,
        exportName: undefined,
      });
    }

    return outputs;
  }

  private extractCDKParameters(content: string): CDKParameterInfo[] {
    const parameters: CDKParameterInfo[] = [];
    const parameterRegex = /new\s+CfnParameter\s*\(\s*this\s*,\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = parameterRegex.exec(content)) !== null) {
      parameters.push({
        logicalId: match[1],
        type: 'String', // Would need more sophisticated parsing
        description: undefined,
      });
    }

    return parameters;
  }

  private extractCDKConditions(content: string): CDKConditionInfo[] {
    const conditions: CDKConditionInfo[] = [];
    const conditionRegex = /new\s+CfnCondition\s*\(\s*this\s*,\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = conditionRegex.exec(content)) !== null) {
      conditions.push({
        logicalId: match[1],
        condition: 'unknown', // Would need more sophisticated parsing
      });
    }

    return conditions;
  }

  private extractStackMetadata(content: string): Record<string, any> {
    return {
      hasCustomResources: content.includes('CustomResource'),
      hasNestedStacks: content.includes('NestedStack'),
      usesAssets: content.includes('Asset'),
      language: content.includes('import') ? 'typescript' : 'javascript',
    };
  }

  private async convertCDKResourceToAWSResource(
    cdkResource: CDKResourceInfo,
    stack: CDKStackInfo
  ): Promise<AWSResourceInfo | null> {
    try {
      const awsResourceType = this.mapCDKTypeToAWSType(cdkResource.type);
      if (!awsResourceType) return null;

      const resourceUsage = this.estimateResourceUsage(cdkResource);
      const resourceCost = this.calculateResourceCostFromType(awsResourceType, resourceUsage);

      const awsResource: AWSResourceInfo = {
        id: `${stack.name}-${cdkResource.logicalId}`,
        type: awsResourceType,
        name: cdkResource.logicalId,
        region: this.extractRegionFromStack(stack),
        properties: cdkResource.properties,
        tags: this.extractResourceTags(cdkResource),
        cost: resourceCost,
        usage: resourceUsage,
        dependencies: cdkResource.dependencies,
        isActive: true,
        lastModified: new Date(),
      };

      return awsResource;
    } catch (error) {
      this.logger.warn(`Failed to convert CDK resource ${cdkResource.logicalId}: ${error.message}`);
      return null;
    }
  }

  private mapCDKTypeToAWSType(cdkType: string): string | null {
    const typeMapping: Record<string, string> = {
      'aws-lambda.Function': 'AWS::Lambda::Function',
      'aws-dynamodb.Table': 'AWS::DynamoDB::Table',
      'aws-s3.Bucket': 'AWS::S3::Bucket',
      'aws-apigateway.RestApi': 'AWS::ApiGateway::RestApi',
      'aws-cognito.UserPool': 'AWS::Cognito::UserPool',
      'aws-appsync.GraphqlApi': 'AWS::AppSync::GraphQLApi',
      'aws-cloudwatch.Alarm': 'AWS::CloudWatch::Alarm',
      'aws-iam.Role': 'AWS::IAM::Role',
      'aws-ec2.Instance': 'AWS::EC2::Instance',
      'aws-rds.DatabaseInstance': 'AWS::RDS::DBInstance',
    };

    // Try exact match first
    if (typeMapping[cdkType]) {
      return typeMapping[cdkType];
    }

    // Try partial matches
    for (const [cdkPattern, awsType] of Object.entries(typeMapping)) {
      if (cdkType.includes(cdkPattern.split('.')[1])) {
        return awsType;
      }
    }

    return null;
  }

  private extractRegionFromStack(stack: CDKStackInfo): string {
    // This would typically be extracted from the stack configuration
    // For now, return a default region
    return 'us-east-1';
  }

  private extractResourceTags(cdkResource: CDKResourceInfo): Record<string, string> {
    // Extract tags from resource properties
    const tags: Record<string, string> = {};
    
    if (cdkResource.properties.tags) {
      // Handle different tag formats
      if (Array.isArray(cdkResource.properties.tags)) {
        for (const tag of cdkResource.properties.tags) {
          if (tag.Key && tag.Value) {
            tags[tag.Key] = tag.Value;
          }
        }
      } else if (typeof cdkResource.properties.tags === 'object') {
        Object.assign(tags, cdkResource.properties.tags);
      }
    }

    return tags;
  }

  private estimateResourceUsage(cdkResource: CDKResourceInfo): ResourceUsage {
    // This is a simplified estimation based on resource type
    const baseUsage: ResourceUsage = {
      period: 'monthly',
    };

    // Add type-specific usage estimates
    if (cdkResource.type.includes('Lambda')) {
      baseUsage.requests = 1000000; // 1M requests per month
      baseUsage.memory = 128; // MB
    } else if (cdkResource.type.includes('DynamoDB')) {
      baseUsage.storage = 1024; // 1GB
      baseUsage.requests = 100000; // 100K requests per month
    } else if (cdkResource.type.includes('S3')) {
      baseUsage.storage = 10240; // 10GB
      baseUsage.requests = 10000; // 10K requests per month
    }

    return baseUsage;
  }

  private calculateResourceCost(resource: AWSResourceInfo): ResourceCost {
    return this.calculateResourceCostFromType(resource.type, resource.usage);
  }

  private calculateResourceCostFromType(resourceType: string, usage: ResourceUsage): ResourceCost {
    // Simplified cost calculation based on AWS pricing (as of 2024)
    let monthlyCost = 0;
    const breakdown: CostBreakdown[] = [];

    if (resourceType.includes('Lambda')) {
      const requestCost = (usage.requests || 0) * 0.0000002; // $0.20 per 1M requests
      const computeCost = (usage.requests || 0) * (usage.memory || 128) * 0.0000166667; // GB-second pricing
      monthlyCost = requestCost + computeCost;
      
      breakdown.push(
        { service: 'Lambda', component: 'Requests', cost: requestCost, unit: 'requests' },
        { service: 'Lambda', component: 'Compute', cost: computeCost, unit: 'GB-seconds' }
      );
    } else if (resourceType.includes('DynamoDB')) {
      const storageCost = (usage.storage || 0) * 0.25 / 1024; // $0.25 per GB per month
      const requestCost = (usage.requests || 0) * 0.000000125; // $0.125 per million requests
      monthlyCost = storageCost + requestCost;
      
      breakdown.push(
        { service: 'DynamoDB', component: 'Storage', cost: storageCost, unit: 'GB' },
        { service: 'DynamoDB', component: 'Requests', cost: requestCost, unit: 'requests' }
      );
    } else if (resourceType.includes('S3')) {
      const storageCost = (usage.storage || 0) * 0.023 / 1024; // $0.023 per GB per month
      const requestCost = (usage.requests || 0) * 0.0004 / 1000; // $0.40 per 1000 requests
      monthlyCost = storageCost + requestCost;
      
      breakdown.push(
        { service: 'S3', component: 'Storage', cost: storageCost, unit: 'GB' },
        { service: 'S3', component: 'Requests', cost: requestCost, unit: 'requests' }
      );
    } else {
      // Default cost for unknown resources
      monthlyCost = 10;
      breakdown.push({ service: 'Unknown', component: 'Base', cost: 10, unit: 'resource' });
    }

    return {
      monthly: monthlyCost,
      yearly: monthlyCost * 12,
      currency: 'USD',
      breakdown,
    };
  }

  private extractServiceName(resourceType: string): string {
    const serviceMap: Record<string, string> = {
      'Lambda': 'AWS Lambda',
      'DynamoDB': 'Amazon DynamoDB',
      'S3': 'Amazon S3',
      'ApiGateway': 'Amazon API Gateway',
      'Cognito': 'Amazon Cognito',
      'AppSync': 'AWS AppSync',
      'CloudWatch': 'Amazon CloudWatch',
      'IAM': 'AWS IAM',
      'EC2': 'Amazon EC2',
      'RDS': 'Amazon RDS',
    };

    for (const [key, service] of Object.entries(serviceMap)) {
      if (resourceType.includes(key)) {
        return service;
      }
    }

    return 'Unknown Service';
  }

  private createCostBreakdown(byService: Record<string, ResourceCost>): CostBreakdown[] {
    const breakdown: CostBreakdown[] = [];

    for (const [service, cost] of Object.entries(byService)) {
      breakdown.push({
        service,
        component: 'Total',
        cost: cost.monthly,
        unit: 'monthly',
      });
    }

    return breakdown;
  }

  private generateCostOptimizationRecommendations(resource: AWSResourceInfo): CostOptimizationRecommendation[] {
    const recommendations: CostOptimizationRecommendation[] = [];

    // Lambda optimization recommendations
    if (resource.type.includes('Lambda')) {
      if ((resource.usage.memory || 0) > 512) {
        recommendations.push({
          resource: resource.id,
          type: 'rightsizing',
          description: 'Consider reducing Lambda memory allocation if not fully utilized',
          potentialSavings: resource.cost.monthly * 0.2,
          effort: 'low',
          risk: 'low',
        });
      }
    }

    // DynamoDB optimization recommendations
    if (resource.type.includes('DynamoDB')) {
      recommendations.push({
        resource: resource.id,
        type: 'reserved_instances',
        description: 'Consider using DynamoDB reserved capacity for predictable workloads',
        potentialSavings: resource.cost.monthly * 0.3,
        effort: 'medium',
        risk: 'low',
      });
    }

    // S3 optimization recommendations
    if (resource.type.includes('S3')) {
      recommendations.push({
        resource: resource.id,
        type: 'storage_optimization',
        description: 'Consider using S3 Intelligent Tiering for automatic cost optimization',
        potentialSavings: resource.cost.monthly * 0.25,
        effort: 'low',
        risk: 'low',
      });
    }

    // General unused resource check
    if (!resource.isActive || (resource.usage.requests || 0) < 100) {
      recommendations.push({
        resource: resource.id,
        type: 'unused_resources',
        description: 'Resource appears to be unused or underutilized',
        potentialSavings: resource.cost.monthly * 0.9,
        effort: 'medium',
        risk: 'medium',
      });
    }

    return recommendations;
  }
}