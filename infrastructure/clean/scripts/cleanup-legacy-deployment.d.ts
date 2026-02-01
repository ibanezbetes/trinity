#!/usr/bin/env ts-node
interface CleanupResult {
    action: string;
    target: string;
    status: 'SUCCESS' | 'SKIPPED' | 'ERROR';
    details: string;
}
declare class LegacyDeploymentCleanup {
    private results;
    private readonly workspaceRoot;
    performCleanup(): Promise<CleanupResult[]>;
    private identifyLegacyScripts;
    private createArchiveDirectory;
    private copyDirectoryRecursive;
    private archiveLegacyScripts;
    private updateDocumentation;
    private generateReport;
}
export { LegacyDeploymentCleanup };
