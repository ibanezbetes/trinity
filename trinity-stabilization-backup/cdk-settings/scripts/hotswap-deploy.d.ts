#!/usr/bin/env npx ts-node
/**
 * Trinity Hotswap Deployment Script
 *
 * Optimized deployment script for rapid development iterations
 * Uses CDK hotswap for Lambda functions and other supported resources
 */
interface HotswapConfig {
    environment: 'dev' | 'staging' | 'production';
    region: string;
    stacks: string[];
    lambdaOnly: boolean;
    skipValidation: boolean;
    watchMode: boolean;
}
declare class TrinityHotswapDeployer {
    private config;
    private cfClient;
    private deploymentLog;
    constructor(config: HotswapConfig);
    private log;
    /**
     * Validate hotswap prerequisites
     */
    validateHotswapPrerequisites(): Promise<boolean>;
    /**
     * Build TypeScript source
     */
    buildSource(): Promise<boolean>;
    /**
     * Execute hotswap deployment
     */
    executeHotswap(): Promise<boolean>;
    /**
     * Watch mode for continuous deployment
     */
    startWatchMode(): Promise<void>;
    /**
     * Generate deployment timing report
     */
    generateTimingReport(startTime: number): void;
    /**
     * Execute hotswap deployment workflow
     */
    execute(): Promise<boolean>;
}
export { TrinityHotswapDeployer, HotswapConfig };
