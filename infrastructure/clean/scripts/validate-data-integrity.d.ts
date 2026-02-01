#!/usr/bin/env ts-node
interface DataValidationResult {
    table: string;
    status: 'PASS' | 'FAIL';
    itemCount: number;
    sampleData: any;
    errors?: string[];
}
declare class DataIntegrityValidator {
    private readonly region;
    private results;
    validateAll(): Promise<DataValidationResult[]>;
    private validateTable;
    private generateReport;
}
export { DataIntegrityValidator };
