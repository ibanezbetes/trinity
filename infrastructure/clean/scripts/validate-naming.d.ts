#!/usr/bin/env npx ts-node
/**
 * Trinity Resource Naming Validation Script
 *
 * Validates that all resources follow Trinity naming conventions
 * and provides recommendations for fixes
 */
interface NamingValidationResult {
    category: string;
    resource: string;
    current: string;
    expected?: string;
    status: 'compliant' | 'non-compliant' | 'warning';
    issues: string[];
}
interface NamingReport {
    timestamp: string;
    environment: string;
    region: string;
    summary: {
        total: number;
        compliant: number;
        nonCompliant: number;
        warnings: number;
    };
    results: NamingValidationResult[];
    recommendations: string[];
}
declare class TrinityNamingValidator {
    private config;
    private cfClient;
    private dynamoClient;
    private lambdaClient;
    private results;
    constructor(environment: string, region?: string);
    private addResult;
    /**
     * Validate DynamoDB table names
     */
    validateDynamoDBTables(): Promise<void>;
    /**
     * Validate Lambda function names
     */
    validateLambdaFunctions(): Promise<void>;
    /**
     * Validate CloudFormation stack names
     */
    validateCloudFormationStacks(): Promise<void>;
    /**
     * Validate CDK construct names in source code
     */
    validateCDKConstructNames(): void;
    /**
     * Generate naming recommendations
     */
    generateRecommendations(): string[];
    /**
     * Generate naming validation report
     */
    generateReport(): NamingReport;
    /**
     * Execute naming validation
     */
    executeValidation(): Promise<NamingReport>;
}
export { TrinityNamingValidator, NamingValidationResult, NamingReport };
