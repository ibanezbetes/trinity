/**
 * Trinity Development Workflow Configuration
 *
 * Optimized workflows for different development scenarios
 */
export interface WorkflowConfig {
    name: string;
    description: string;
    commands: string[];
    estimatedTime: string;
    useCase: string;
}
/**
 * Development Workflows
 */
export declare const DEVELOPMENT_WORKFLOWS: WorkflowConfig[];
/**
 * Hotswap Compatibility Matrix
 */
export declare const HOTSWAP_COMPATIBILITY: {
    'AWS::Lambda::Function': {
        supported: boolean;
        properties: string[];
        limitations: string;
    };
    'AWS::StepFunctions::StateMachine': {
        supported: boolean;
        properties: string[];
        limitations: string;
    };
    'AWS::ECS::Service': {
        supported: boolean;
        properties: string[];
        limitations: string;
    };
    'AWS::DynamoDB::Table': {
        supported: boolean;
        properties: never[];
        limitations: string;
    };
    'AWS::AppSync::GraphQLApi': {
        supported: boolean;
        properties: never[];
        limitations: string;
    };
    'AWS::Cognito::UserPool': {
        supported: boolean;
        properties: never[];
        limitations: string;
    };
};
/**
 * Development Environment Recommendations
 */
export declare const DEV_RECOMMENDATIONS: {
    'Lambda Development': {
        workflow: string;
        tools: string[];
        tips: string[];
    };
    'API Development': {
        workflow: string;
        tools: string[];
        tips: string[];
    };
    'Database Schema Changes': {
        workflow: string;
        tools: string[];
        tips: string[];
    };
    'Infrastructure Changes': {
        workflow: string;
        tools: string[];
        tips: string[];
    };
};
/**
 * Performance Optimization Tips
 */
export declare const PERFORMANCE_TIPS: {
    category: string;
    tips: string[];
}[];
/**
 * Get recommended workflow for change type
 */
export declare function getRecommendedWorkflow(changeType: string): WorkflowConfig | null;
/**
 * Check if resource supports hotswap
 */
export declare function supportsHotswap(resourceType: string): boolean;
/**
 * Get hotswap limitations for resource
 */
export declare function getHotswapLimitations(resourceType: string): string;
