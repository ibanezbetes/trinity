#!/usr/bin/env node
/**
 * Schema Validation Script
 * Compares CDK-generated CloudFormation template against live DynamoDB tables
 * Ensures perfect match before CDK import operation
 */
declare class SchemaValidator {
    private dynamoClient;
    private expectedTables;
    validateAll(): Promise<boolean>;
    private extractTablesFromTemplate;
    private validateTable;
    private compareKeySchema;
    private compareAttributeDefinitions;
    private compareGlobalSecondaryIndexes;
}
export { SchemaValidator };
