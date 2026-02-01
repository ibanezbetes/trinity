#!/usr/bin/env npx ts-node
/**
 * Trinity System Integration Testing Script
 *
 * Comprehensive end-to-end testing and validation before infrastructure import
 * This is the critical "Dry Run" checkpoint to ensure TypeScript code
 * interacts correctly with existing resources
 */
interface TestResult {
    category: string;
    test: string;
    status: 'pass' | 'fail' | 'skip';
    duration: number;
    message: string;
    details?: any;
}
interface IntegrationTestReport {
    timestamp: string;
    environment: string;
    region: string;
    overallStatus: 'pass' | 'fail';
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
    };
    results: TestResult[];
    propertyTestResults: {
        [testFile: string]: {
            status: 'pass' | 'fail';
            iterations: number;
            duration: number;
            errors?: string[];
        };
    };
    recommendations: string[];
}
declare class TrinityIntegrationTester {
    private environment;
    private region;
    private cfClient;
    private dynamoClient;
    private lambdaClient;
    private results;
    private startTime;
    constructor(environment: string, region?: string);
    private log;
    private addResult;
    /**
     * Test TypeScript compilation
     */
    testTypeScriptCompilation(): Promise<void>;
    /**
     * Test CDK synthesis
     */
    testCDKSynthesis(): Promise<void>;
    /**
     * Test AWS connectivity and permissions
     */
    testAWSConnectivity(): Promise<void>;
    /**
     * Test existing resource compatibility
     */
    testResourceCompatibility(): Promise<void>;
    /**
     * Run property-based tests
     */
    runPropertyBasedTests(): Promise<{
        [testFile: string]: any;
    }>;
    /**
     * Test CDK diff against existing resources
     */
    testCDKDiff(): Promise<void>;
    /**
     * Test deployment validation scripts
     */
    testValidationScripts(): Promise<void>;
    /**
     * Test import preparation
     */
    testImportPreparation(): Promise<void>;
    /**
     * Generate integration test report
     */
    generateReport(propertyTestResults: {
        [testFile: string]: any;
    }): IntegrationTestReport;
    /**
     * Execute comprehensive integration testing
     */
    execute(): Promise<IntegrationTestReport>;
}
export { TrinityIntegrationTester, IntegrationTestReport };
