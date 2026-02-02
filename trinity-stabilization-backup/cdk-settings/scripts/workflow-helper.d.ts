#!/usr/bin/env npx ts-node
/**
 * Trinity Workflow Helper
 *
 * Interactive guide for choosing the optimal deployment workflow
 * based on the type of changes being made
 */
interface ChangeAnalysis {
    hasLambdaChanges: boolean;
    hasInfrastructureChanges: boolean;
    hasSchemaChanges: boolean;
    hasApiChanges: boolean;
    changedFiles: string[];
}
declare class TrinityWorkflowHelper {
    /**
     * Analyze git changes to determine change types
     */
    analyzeChanges(): ChangeAnalysis;
    /**
     * Display change analysis
     */
    displayAnalysis(analysis: ChangeAnalysis): void;
    /**
     * Recommend workflow based on analysis
     */
    recommendWorkflow(analysis: ChangeAnalysis): void;
    /**
     * Display available workflows
     */
    displayWorkflows(): void;
    /**
     * Display development recommendations
     */
    displayRecommendations(): void;
    /**
     * Interactive workflow selection
     */
    interactiveMode(): Promise<void>;
    /**
     * Execute recommended workflow
     */
    executeWorkflow(workflowName: string): void;
}
export { TrinityWorkflowHelper };
