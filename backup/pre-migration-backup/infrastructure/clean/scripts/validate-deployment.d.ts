#!/usr/bin/env npx ts-node
/**
 * Trinity Deployment Validation Script
 *
 * Comprehensive validation for Trinity deployments including:
 * - Pre-deployment environment checks
 * - Post-deployment resource validation
 * - Configuration consistency checks
 * - Security compliance validation
 */
interface ValidationResult {
    category: string;
    test: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    details?: any;
}
interface ValidationReport {
    timestamp: string;
    environment: string;
    region: string;
    overallStatus: 'pass' | 'fail' | 'warn';
    summary: {
        total: number;
        passed: number;
        failed: number;
        warnings: number;
    };
    results: ValidationResult[];
}
declare class TrinityDeploymentValidator {
    private config;
    private cfClient;
    private dynamoClient;
    private appSyncClient;
    private lambdaClient;
    private results;
    constructor(environment: string, region?: string);
    private addResult;
    /**
     * Validate pre-deployment environment
     */
    validateEnvironment(): Promise<void>;
    /**
     * Validate DynamoDB tables
     */
    validateDynamoDBTables(): Promise<void>;
    /**
     * Validate Lambda functions
     */
    validateLambdaFunctions(): Promise<void>;
    /**
     * Validate AppSync APIs
     */
    validateAppSyncAPIs(): Promise<void>;
    /**
     * Validate CloudFormation stacks
     */
    validateCloudFormationStacks(): Promise<void>;
    /**
     * Validate CDK outputs
     */
    validateCDKOutputs(): void;
    /**
     * Generate validation report
     */
    generateReport(): ValidationReport;
    /**
     * Execute full validation
     */
    executeValidation(mode?: 'pre' | 'post'): Promise<ValidationReport>;
}
export { TrinityDeploymentValidator, ValidationResult, ValidationReport };
