#!/usr/bin/env ts-node
interface SecurityValidationResult {
    category: string;
    check: string;
    status: 'PASS' | 'FAIL' | 'WARNING';
    details: string;
    recommendation?: string;
}
declare class SecurityComplianceValidator {
    private readonly region;
    private results;
    validateAll(): Promise<SecurityValidationResult[]>;
    private validateEncryption;
    private validateIAMPolicies;
    private validateNetworkSecurity;
    private validateMonitoring;
    private validateDataProtection;
    private validateAccessControl;
    private validateAuditLogging;
    private generateReport;
}
export { SecurityComplianceValidator };
