#!/usr/bin/env ts-node
interface VerificationResult {
    component: string;
    status: 'PASS' | 'FAIL';
    details: string;
    errors?: string[];
}
declare class InfrastructureIntegrityVerifier {
    private readonly region;
    private results;
    verifyAll(): Promise<VerificationResult[]>;
    private verifyCloudFormationStacks;
    private verifyDynamoDBTables;
    private verifyLambdaFunctions;
    private verifyAppSyncAPIs;
    private verifyCognitoResources;
    private generateReport;
}
export { InfrastructureIntegrityVerifier };
