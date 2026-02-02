"use strict";
/**
 * Trinity Development Workflow Configuration
 *
 * Optimized workflows for different development scenarios
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERFORMANCE_TIPS = exports.DEV_RECOMMENDATIONS = exports.HOTSWAP_COMPATIBILITY = exports.DEVELOPMENT_WORKFLOWS = void 0;
exports.getRecommendedWorkflow = getRecommendedWorkflow;
exports.supportsHotswap = supportsHotswap;
exports.getHotswapLimitations = getHotswapLimitations;
/**
 * Development Workflows
 */
exports.DEVELOPMENT_WORKFLOWS = [
    {
        name: 'Quick Lambda Update',
        description: 'Fastest deployment for Lambda function changes only',
        commands: [
            'npm run build',
            'npm run hotswap:lambda'
        ],
        estimatedTime: '15-30 seconds',
        useCase: 'Lambda function code changes during active development'
    },
    {
        name: 'Full Hotswap',
        description: 'Fast deployment for all hotswap-compatible resources',
        commands: [
            'npm run validate:pre',
            'npm run build',
            'npm run hotswap:all'
        ],
        estimatedTime: '1-2 minutes',
        useCase: 'Multiple resource changes that support hotswap'
    },
    {
        name: 'Watch Mode Development',
        description: 'Continuous deployment on file changes',
        commands: [
            'npm run hotswap:watch'
        ],
        estimatedTime: 'Continuous (15-30s per change)',
        useCase: 'Active development with frequent Lambda changes'
    },
    {
        name: 'Standard Development Deploy',
        description: 'Full deployment with validation for development',
        commands: [
            'npm run validate:pre',
            'npm run build',
            'npm run deploy:lambda'
        ],
        estimatedTime: '3-5 minutes',
        useCase: 'Infrastructure changes that require full deployment'
    },
    {
        name: 'Safe Production Deploy',
        description: 'Full deployment with comprehensive validation',
        commands: [
            'npm run validate:pre',
            'npm run build',
            'npm run deploy:all',
            'npm run validate'
        ],
        estimatedTime: '10-15 minutes',
        useCase: 'Production deployments with full validation'
    }
];
/**
 * Hotswap Compatibility Matrix
 */
exports.HOTSWAP_COMPATIBILITY = {
    'AWS::Lambda::Function': {
        supported: true,
        properties: ['Code', 'Environment', 'Description', 'Timeout', 'MemorySize'],
        limitations: 'Runtime and handler changes require full deployment'
    },
    'AWS::StepFunctions::StateMachine': {
        supported: true,
        properties: ['Definition', 'DefinitionString'],
        limitations: 'Role changes require full deployment'
    },
    'AWS::ECS::Service': {
        supported: true,
        properties: ['TaskDefinition', 'DesiredCount'],
        limitations: 'Network configuration changes require full deployment'
    },
    'AWS::DynamoDB::Table': {
        supported: false,
        properties: [],
        limitations: 'DynamoDB changes always require full deployment'
    },
    'AWS::AppSync::GraphQLApi': {
        supported: false,
        properties: [],
        limitations: 'AppSync changes always require full deployment'
    },
    'AWS::Cognito::UserPool': {
        supported: false,
        properties: [],
        limitations: 'Cognito changes always require full deployment'
    }
};
/**
 * Development Environment Recommendations
 */
exports.DEV_RECOMMENDATIONS = {
    'Lambda Development': {
        workflow: 'Quick Lambda Update',
        tools: ['hotswap:lambda', 'hotswap:watch'],
        tips: [
            'Use watch mode for continuous development',
            'Test locally with SAM CLI when possible',
            'Keep Lambda functions small for faster deployments'
        ]
    },
    'API Development': {
        workflow: 'Standard Development Deploy',
        tools: ['deploy:api', 'validate'],
        tips: [
            'AppSync schema changes require full deployment',
            'Test GraphQL queries in AppSync console',
            'Use CDK diff to preview changes'
        ]
    },
    'Database Schema Changes': {
        workflow: 'Safe Production Deploy',
        tools: ['validate:pre', 'deploy:database', 'validate'],
        tips: [
            'Always backup before schema changes',
            'Test migrations in development first',
            'Use CDK import for existing tables'
        ]
    },
    'Infrastructure Changes': {
        workflow: 'Standard Development Deploy',
        tools: ['deploy:all', 'validate'],
        tips: [
            'Review CDK diff output carefully',
            'Test in development environment first',
            'Use rollback scripts if needed'
        ]
    }
};
/**
 * Performance Optimization Tips
 */
exports.PERFORMANCE_TIPS = [
    {
        category: 'Build Optimization',
        tips: [
            'Use TypeScript incremental compilation',
            'Enable CDK asset caching',
            'Minimize Lambda bundle sizes with esbuild'
        ]
    },
    {
        category: 'Deployment Speed',
        tips: [
            'Use hotswap for Lambda-only changes',
            'Deploy specific stacks instead of --all',
            'Skip validation for trusted changes'
        ]
    },
    {
        category: 'Development Workflow',
        tips: [
            'Use watch mode for active development',
            'Test locally before deployment',
            'Use CDK diff to preview changes'
        ]
    }
];
/**
 * Get recommended workflow for change type
 */
function getRecommendedWorkflow(changeType) {
    const workflows = {
        'lambda': exports.DEVELOPMENT_WORKFLOWS[0], // Quick Lambda Update
        'api': exports.DEVELOPMENT_WORKFLOWS[3], // Standard Development Deploy
        'database': exports.DEVELOPMENT_WORKFLOWS[4], // Safe Production Deploy
        'infrastructure': exports.DEVELOPMENT_WORKFLOWS[3], // Standard Development Deploy
        'hotswap': exports.DEVELOPMENT_WORKFLOWS[1], // Full Hotswap
        'watch': exports.DEVELOPMENT_WORKFLOWS[2], // Watch Mode Development
    };
    return workflows[changeType.toLowerCase()] || null;
}
/**
 * Check if resource supports hotswap
 */
function supportsHotswap(resourceType) {
    return exports.HOTSWAP_COMPATIBILITY[resourceType]?.supported || false;
}
/**
 * Get hotswap limitations for resource
 */
function getHotswapLimitations(resourceType) {
    return exports.HOTSWAP_COMPATIBILITY[resourceType]?.limitations || 'Resource does not support hotswap';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2ZWxvcG1lbnQtd29ya2Zsb3cuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkZXZlbG9wbWVudC13b3JrZmxvdy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7R0FJRzs7O0FBb0xILHdEQVdDO0FBS0QsMENBRUM7QUFLRCxzREFFQztBQW5NRDs7R0FFRztBQUNVLFFBQUEscUJBQXFCLEdBQXFCO0lBQ3JEO1FBQ0UsSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixXQUFXLEVBQUUscURBQXFEO1FBQ2xFLFFBQVEsRUFBRTtZQUNSLGVBQWU7WUFDZix3QkFBd0I7U0FDekI7UUFDRCxhQUFhLEVBQUUsZUFBZTtRQUM5QixPQUFPLEVBQUUsd0RBQXdEO0tBQ2xFO0lBQ0Q7UUFDRSxJQUFJLEVBQUUsY0FBYztRQUNwQixXQUFXLEVBQUUsc0RBQXNEO1FBQ25FLFFBQVEsRUFBRTtZQUNSLHNCQUFzQjtZQUN0QixlQUFlO1lBQ2YscUJBQXFCO1NBQ3RCO1FBQ0QsYUFBYSxFQUFFLGFBQWE7UUFDNUIsT0FBTyxFQUFFLGdEQUFnRDtLQUMxRDtJQUNEO1FBQ0UsSUFBSSxFQUFFLHdCQUF3QjtRQUM5QixXQUFXLEVBQUUsdUNBQXVDO1FBQ3BELFFBQVEsRUFBRTtZQUNSLHVCQUF1QjtTQUN4QjtRQUNELGFBQWEsRUFBRSxnQ0FBZ0M7UUFDL0MsT0FBTyxFQUFFLGlEQUFpRDtLQUMzRDtJQUNEO1FBQ0UsSUFBSSxFQUFFLDZCQUE2QjtRQUNuQyxXQUFXLEVBQUUsaURBQWlEO1FBQzlELFFBQVEsRUFBRTtZQUNSLHNCQUFzQjtZQUN0QixlQUFlO1lBQ2YsdUJBQXVCO1NBQ3hCO1FBQ0QsYUFBYSxFQUFFLGFBQWE7UUFDNUIsT0FBTyxFQUFFLHFEQUFxRDtLQUMvRDtJQUNEO1FBQ0UsSUFBSSxFQUFFLHdCQUF3QjtRQUM5QixXQUFXLEVBQUUsK0NBQStDO1FBQzVELFFBQVEsRUFBRTtZQUNSLHNCQUFzQjtZQUN0QixlQUFlO1lBQ2Ysb0JBQW9CO1lB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QUUsc0JBQXNCO1FBQzFELEtBQUssRUFBRSw2QkFBcUIsQ0FBQyxDQUFDLENBQUMsRUFBSyw4QkFBOEI7UUFDbEUsVUFBVSxFQUFFLDZCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFLHlCQUF5QjtRQUMvRCxnQkFBZ0IsRUFBRSw2QkFBcUIsQ0FBQyxDQUFDLENBQUMsRUFBRSw4QkFBOEI7UUFDMUUsU0FBUyxFQUFFLDZCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFLGVBQWU7UUFDcEQsT0FBTyxFQUFFLDZCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFJLHlCQUF5QjtLQUMvRCxDQUFDO0lBRUYsT0FBTyxTQUFTLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDO0FBQ3JELENBQUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLGVBQWUsQ0FBQyxZQUFvQjtJQUNsRCxPQUFRLDZCQUE2QyxDQUFDLFlBQVksQ0FBQyxFQUFFLFNBQVMsSUFBSSxLQUFLLENBQUM7QUFDMUYsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBZ0IscUJBQXFCLENBQUMsWUFBb0I7SUFDeEQsT0FBUSw2QkFBNkMsQ0FBQyxZQUFZLENBQUMsRUFBRSxXQUFXLElBQUksbUNBQW1DLENBQUM7QUFDMUgsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBUcmluaXR5IERldmVsb3BtZW50IFdvcmtmbG93IENvbmZpZ3VyYXRpb25cclxuICogXHJcbiAqIE9wdGltaXplZCB3b3JrZmxvd3MgZm9yIGRpZmZlcmVudCBkZXZlbG9wbWVudCBzY2VuYXJpb3NcclxuICovXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtmbG93Q29uZmlnIHtcclxuICBuYW1lOiBzdHJpbmc7XHJcbiAgZGVzY3JpcHRpb246IHN0cmluZztcclxuICBjb21tYW5kczogc3RyaW5nW107XHJcbiAgZXN0aW1hdGVkVGltZTogc3RyaW5nO1xyXG4gIHVzZUNhc2U6IHN0cmluZztcclxufVxyXG5cclxuLyoqXHJcbiAqIERldmVsb3BtZW50IFdvcmtmbG93c1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IERFVkVMT1BNRU5UX1dPUktGTE9XUzogV29ya2Zsb3dDb25maWdbXSA9IFtcclxuICB7XHJcbiAgICBuYW1lOiAnUXVpY2sgTGFtYmRhIFVwZGF0ZScsXHJcbiAgICBkZXNjcmlwdGlvbjogJ0Zhc3Rlc3QgZGVwbG95bWVudCBmb3IgTGFtYmRhIGZ1bmN0aW9uIGNoYW5nZXMgb25seScsXHJcbiAgICBjb21tYW5kczogW1xyXG4gICAgICAnbnBtIHJ1biBidWlsZCcsXHJcbiAgICAgICducG0gcnVuIGhvdHN3YXA6bGFtYmRhJ1xyXG4gICAgXSxcclxuICAgIGVzdGltYXRlZFRpbWU6ICcxNS0zMCBzZWNvbmRzJyxcclxuICAgIHVzZUNhc2U6ICdMYW1iZGEgZnVuY3Rpb24gY29kZSBjaGFuZ2VzIGR1cmluZyBhY3RpdmUgZGV2ZWxvcG1lbnQnXHJcbiAgfSxcclxuICB7XHJcbiAgICBuYW1lOiAnRnVsbCBIb3Rzd2FwJyxcclxuICAgIGRlc2NyaXB0aW9uOiAnRmFzdCBkZXBsb3ltZW50IGZvciBhbGwgaG90c3dhcC1jb21wYXRpYmxlIHJlc291cmNlcycsXHJcbiAgICBjb21tYW5kczogW1xyXG4gICAgICAnbnBtIHJ1biB2YWxpZGF0ZTpwcmUnLFxyXG4gICAgICAnbnBtIHJ1biBidWlsZCcsXHJcbiAgICAgICducG0gcnVuIGhvdHN3YXA6YWxsJ1xyXG4gICAgXSxcclxuICAgIGVzdGltYXRlZFRpbWU6ICcxLTIgbWludXRlcycsXHJcbiAgICB1c2VDYXNlOiAnTXVsdGlwbGUgcmVzb3VyY2UgY2hhbmdlcyB0aGF0IHN1cHBvcnQgaG90c3dhcCdcclxuICB9LFxyXG4gIHtcclxuICAgIG5hbWU6ICdXYXRjaCBNb2RlIERldmVsb3BtZW50JyxcclxuICAgIGRlc2NyaXB0aW9uOiAnQ29udGludW91cyBkZXBsb3ltZW50IG9uIGZpbGUgY2hhbmdlcycsXHJcbiAgICBjb21tYW5kczogW1xyXG4gICAgICAnbnBtIHJ1biBob3Rzd2FwOndhdGNoJ1xyXG4gICAgXSxcclxuICAgIGVzdGltYXRlZFRpbWU6ICdDb250aW51b3VzICgxNS0zMHMgcGVyIGNoYW5nZSknLFxyXG4gICAgdXNlQ2FzZTogJ0FjdGl2ZSBkZXZlbG9wbWVudCB3aXRoIGZyZXF1ZW50IExhbWJkYSBjaGFuZ2VzJ1xyXG4gIH0sXHJcbiAge1xyXG4gICAgbmFtZTogJ1N0YW5kYXJkIERldmVsb3BtZW50IERlcGxveScsXHJcbiAgICBkZXNjcmlwdGlvbjogJ0Z1bGwgZGVwbG95bWVudCB3aXRoIHZhbGlkYXRpb24gZm9yIGRldmVsb3BtZW50JyxcclxuICAgIGNvbW1hbmRzOiBbXHJcbiAgICAgICducG0gcnVuIHZhbGlkYXRlOnByZScsXHJcbiAgICAgICducG0gcnVuIGJ1aWxkJyxcclxuICAgICAgJ25wbSBydW4gZGVwbG95OmxhbWJkYSdcclxuICAgIF0sXHJcbiAgICBlc3RpbWF0ZWRUaW1lOiAnMy01IG1pbnV0ZXMnLFxyXG4gICAgdXNlQ2FzZTogJ0luZnJhc3RydWN0dXJlIGNoYW5nZXMgdGhhdCByZXF1aXJlIGZ1bGwgZGVwbG95bWVudCdcclxuICB9LFxyXG4gIHtcclxuICAgIG5hbWU6ICdTYWZlIFByb2R1Y3Rpb24gRGVwbG95JyxcclxuICAgIGRlc2NyaXB0aW9uOiAnRnVsbCBkZXBsb3ltZW50IHdpdGggY29tcHJlaGVuc2l2ZSB2YWxpZGF0aW9uJyxcclxuICAgIGNvbW1hbmRzOiBbXHJcbiAgICAgICducG0gcnVuIHZhbGlkYXRlOnByZScsXHJcbiAgICAgICducG0gcnVuIGJ1aWxkJyxcclxuICAgICAgJ25wbSBydW4gZGVwbG95OmFsbCcsXHJcbiAgICAgICducG0gcnVuIHZhbGlkYXRlJ1xyXG4gICAgXSxcclxuICAgIGVzdGltYXRlZFRpbWU6ICcxMC0xNSBtaW51dGVzJyxcclxuICAgIHVzZUNhc2U6ICdQcm9kdWN0aW9uIGRlcGxveW1lbnRzIHdpdGggZnVsbCB2YWxpZGF0aW9uJ1xyXG4gIH1cclxuXTtcclxuXHJcbi8qKlxyXG4gKiBIb3Rzd2FwIENvbXBhdGliaWxpdHkgTWF0cml4XHJcbiAqL1xyXG5leHBvcnQgY29uc3QgSE9UU1dBUF9DT01QQVRJQklMSVRZID0ge1xyXG4gICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nOiB7XHJcbiAgICBzdXBwb3J0ZWQ6IHRydWUsXHJcbiAgICBwcm9wZXJ0aWVzOiBbJ0NvZGUnLCAnRW52aXJvbm1lbnQnLCAnRGVzY3JpcHRpb24nLCAnVGltZW91dCcsICdNZW1vcnlTaXplJ10sXHJcbiAgICBsaW1pdGF0aW9uczogJ1J1bnRpbWUgYW5kIGhhbmRsZXIgY2hhbmdlcyByZXF1aXJlIGZ1bGwgZGVwbG95bWVudCdcclxuICB9LFxyXG4gICdBV1M6OlN0ZXBGdW5jdGlvbnM6OlN0YXRlTWFjaGluZSc6IHtcclxuICAgIHN1cHBvcnRlZDogdHJ1ZSxcclxuICAgIHByb3BlcnRpZXM6IFsnRGVmaW5pdGlvbicsICdEZWZpbml0aW9uU3RyaW5nJ10sXHJcbiAgICBsaW1pdGF0aW9uczogJ1JvbGUgY2hhbmdlcyByZXF1aXJlIGZ1bGwgZGVwbG95bWVudCdcclxuICB9LFxyXG4gICdBV1M6OkVDUzo6U2VydmljZSc6IHtcclxuICAgIHN1cHBvcnRlZDogdHJ1ZSxcclxuICAgIHByb3BlcnRpZXM6IFsnVGFza0RlZmluaXRpb24nLCAnRGVzaXJlZENvdW50J10sXHJcbiAgICBsaW1pdGF0aW9uczogJ05ldHdvcmsgY29uZmlndXJhdGlvbiBjaGFuZ2VzIHJlcXVpcmUgZnVsbCBkZXBsb3ltZW50J1xyXG4gIH0sXHJcbiAgJ0FXUzo6RHluYW1vREI6OlRhYmxlJzoge1xyXG4gICAgc3VwcG9ydGVkOiBmYWxzZSxcclxuICAgIHByb3BlcnRpZXM6IFtdLFxyXG4gICAgbGltaXRhdGlvbnM6ICdEeW5hbW9EQiBjaGFuZ2VzIGFsd2F5cyByZXF1aXJlIGZ1bGwgZGVwbG95bWVudCdcclxuICB9LFxyXG4gICdBV1M6OkFwcFN5bmM6OkdyYXBoUUxBcGknOiB7XHJcbiAgICBzdXBwb3J0ZWQ6IGZhbHNlLFxyXG4gICAgcHJvcGVydGllczogW10sXHJcbiAgICBsaW1pdGF0aW9uczogJ0FwcFN5bmMgY2hhbmdlcyBhbHdheXMgcmVxdWlyZSBmdWxsIGRlcGxveW1lbnQnXHJcbiAgfSxcclxuICAnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCc6IHtcclxuICAgIHN1cHBvcnRlZDogZmFsc2UsXHJcbiAgICBwcm9wZXJ0aWVzOiBbXSxcclxuICAgIGxpbWl0YXRpb25zOiAnQ29nbml0byBjaGFuZ2VzIGFsd2F5cyByZXF1aXJlIGZ1bGwgZGVwbG95bWVudCdcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogRGV2ZWxvcG1lbnQgRW52aXJvbm1lbnQgUmVjb21tZW5kYXRpb25zXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgREVWX1JFQ09NTUVOREFUSU9OUyA9IHtcclxuICAnTGFtYmRhIERldmVsb3BtZW50Jzoge1xyXG4gICAgd29ya2Zsb3c6ICdRdWljayBMYW1iZGEgVXBkYXRlJyxcclxuICAgIHRvb2xzOiBbJ2hvdHN3YXA6bGFtYmRhJywgJ2hvdHN3YXA6d2F0Y2gnXSxcclxuICAgIHRpcHM6IFtcclxuICAgICAgJ1VzZSB3YXRjaCBtb2RlIGZvciBjb250aW51b3VzIGRldmVsb3BtZW50JyxcclxuICAgICAgJ1Rlc3QgbG9jYWxseSB3aXRoIFNBTSBDTEkgd2hlbiBwb3NzaWJsZScsXHJcbiAgICAgICdLZWVwIExhbWJkYSBmdW5jdGlvbnMgc21hbGwgZm9yIGZhc3RlciBkZXBsb3ltZW50cydcclxuICAgIF1cclxuICB9LFxyXG4gICdBUEkgRGV2ZWxvcG1lbnQnOiB7XHJcbiAgICB3b3JrZmxvdzogJ1N0YW5kYXJkIERldmVsb3BtZW50IERlcGxveScsXHJcbiAgICB0b29sczogWydkZXBsb3k6YXBpJywgJ3ZhbGlkYXRlJ10sXHJcbiAgICB0aXBzOiBbXHJcbiAgICAgICdBcHBTeW5jIHNjaGVtYSBjaGFuZ2VzIHJlcXVpcmUgZnVsbCBkZXBsb3ltZW50JyxcclxuICAgICAgJ1Rlc3QgR3JhcGhRTCBxdWVyaWVzIGluIEFwcFN5bmMgY29uc29sZScsXHJcbiAgICAgICdVc2UgQ0RLIGRpZmYgdG8gcHJldmlldyBjaGFuZ2VzJ1xyXG4gICAgXVxyXG4gIH0sXHJcbiAgJ0RhdGFiYXNlIFNjaGVtYSBDaGFuZ2VzJzoge1xyXG4gICAgd29ya2Zsb3c6ICdTYWZlIFByb2R1Y3Rpb24gRGVwbG95JyxcclxuICAgIHRvb2xzOiBbJ3ZhbGlkYXRlOnByZScsICdkZXBsb3k6ZGF0YWJhc2UnLCAndmFsaWRhdGUnXSxcclxuICAgIHRpcHM6IFtcclxuICAgICAgJ0Fsd2F5cyBiYWNrdXAgYmVmb3JlIHNjaGVtYSBjaGFuZ2VzJyxcclxuICAgICAgJ1Rlc3QgbWlncmF0aW9ucyBpbiBkZXZlbG9wbWVudCBmaXJzdCcsXHJcbiAgICAgICdVc2UgQ0RLIGltcG9ydCBmb3IgZXhpc3RpbmcgdGFibGVzJ1xyXG4gICAgXVxyXG4gIH0sXHJcbiAgJ0luZnJhc3RydWN0dXJlIENoYW5nZXMnOiB7XHJcbiAgICB3b3JrZmxvdzogJ1N0YW5kYXJkIERldmVsb3BtZW50IERlcGxveScsXHJcbiAgICB0b29sczogWydkZXBsb3k6YWxsJywgJ3ZhbGlkYXRlJ10sXHJcbiAgICB0aXBzOiBbXHJcbiAgICAgICdSZXZpZXcgQ0RLIGRpZmYgb3V0cHV0IGNhcmVmdWxseScsXHJcbiAgICAgICdUZXN0IGluIGRldmVsb3BtZW50IGVudmlyb25tZW50IGZpcnN0JyxcclxuICAgICAgJ1VzZSByb2xsYmFjayBzY3JpcHRzIGlmIG5lZWRlZCdcclxuICAgIF1cclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uIFRpcHNcclxuICovXHJcbmV4cG9ydCBjb25zdCBQRVJGT1JNQU5DRV9USVBTID0gW1xyXG4gIHtcclxuICAgIGNhdGVnb3J5OiAnQnVpbGQgT3B0aW1pemF0aW9uJyxcclxuICAgIHRpcHM6IFtcclxuICAgICAgJ1VzZSBUeXBlU2NyaXB0IGluY3JlbWVudGFsIGNvbXBpbGF0aW9uJyxcclxuICAgICAgJ0VuYWJsZSBDREsgYXNzZXQgY2FjaGluZycsXHJcbiAgICAgICdNaW5pbWl6ZSBMYW1iZGEgYnVuZGxlIHNpemVzIHdpdGggZXNidWlsZCdcclxuICAgIF1cclxuICB9LFxyXG4gIHtcclxuICAgIGNhdGVnb3J5OiAnRGVwbG95bWVudCBTcGVlZCcsXHJcbiAgICB0aXBzOiBbXHJcbiAgICAgICdVc2UgaG90c3dhcCBmb3IgTGFtYmRhLW9ubHkgY2hhbmdlcycsXHJcbiAgICAgICdEZXBsb3kgc3BlY2lmaWMgc3RhY2tzIGluc3RlYWQgb2YgLS1hbGwnLFxyXG4gICAgICAnU2tpcCB2YWxpZGF0aW9uIGZvciB0cnVzdGVkIGNoYW5nZXMnXHJcbiAgICBdXHJcbiAgfSxcclxuICB7XHJcbiAgICBjYXRlZ29yeTogJ0RldmVsb3BtZW50IFdvcmtmbG93JyxcclxuICAgIHRpcHM6IFtcclxuICAgICAgJ1VzZSB3YXRjaCBtb2RlIGZvciBhY3RpdmUgZGV2ZWxvcG1lbnQnLFxyXG4gICAgICAnVGVzdCBsb2NhbGx5IGJlZm9yZSBkZXBsb3ltZW50JyxcclxuICAgICAgJ1VzZSBDREsgZGlmZiB0byBwcmV2aWV3IGNoYW5nZXMnXHJcbiAgICBdXHJcbiAgfVxyXG5dO1xyXG5cclxuLyoqXHJcbiAqIEdldCByZWNvbW1lbmRlZCB3b3JrZmxvdyBmb3IgY2hhbmdlIHR5cGVcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRSZWNvbW1lbmRlZFdvcmtmbG93KGNoYW5nZVR5cGU6IHN0cmluZyk6IFdvcmtmbG93Q29uZmlnIHwgbnVsbCB7XHJcbiAgY29uc3Qgd29ya2Zsb3dzOiBSZWNvcmQ8c3RyaW5nLCBXb3JrZmxvd0NvbmZpZz4gPSB7XHJcbiAgICAnbGFtYmRhJzogREVWRUxPUE1FTlRfV09SS0ZMT1dTWzBdLCAvLyBRdWljayBMYW1iZGEgVXBkYXRlXHJcbiAgICAnYXBpJzogREVWRUxPUE1FTlRfV09SS0ZMT1dTWzNdLCAgICAvLyBTdGFuZGFyZCBEZXZlbG9wbWVudCBEZXBsb3lcclxuICAgICdkYXRhYmFzZSc6IERFVkVMT1BNRU5UX1dPUktGTE9XU1s0XSwgLy8gU2FmZSBQcm9kdWN0aW9uIERlcGxveVxyXG4gICAgJ2luZnJhc3RydWN0dXJlJzogREVWRUxPUE1FTlRfV09SS0ZMT1dTWzNdLCAvLyBTdGFuZGFyZCBEZXZlbG9wbWVudCBEZXBsb3lcclxuICAgICdob3Rzd2FwJzogREVWRUxPUE1FTlRfV09SS0ZMT1dTWzFdLCAvLyBGdWxsIEhvdHN3YXBcclxuICAgICd3YXRjaCc6IERFVkVMT1BNRU5UX1dPUktGTE9XU1syXSwgICAvLyBXYXRjaCBNb2RlIERldmVsb3BtZW50XHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIHdvcmtmbG93c1tjaGFuZ2VUeXBlLnRvTG93ZXJDYXNlKCldIHx8IG51bGw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDaGVjayBpZiByZXNvdXJjZSBzdXBwb3J0cyBob3Rzd2FwXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc3VwcG9ydHNIb3Rzd2FwKHJlc291cmNlVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIChIT1RTV0FQX0NPTVBBVElCSUxJVFkgYXMgUmVjb3JkPHN0cmluZywgYW55PilbcmVzb3VyY2VUeXBlXT8uc3VwcG9ydGVkIHx8IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogR2V0IGhvdHN3YXAgbGltaXRhdGlvbnMgZm9yIHJlc291cmNlXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0SG90c3dhcExpbWl0YXRpb25zKHJlc291cmNlVHlwZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gKEhPVFNXQVBfQ09NUEFUSUJJTElUWSBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+KVtyZXNvdXJjZVR5cGVdPy5saW1pdGF0aW9ucyB8fCAnUmVzb3VyY2UgZG9lcyBub3Qgc3VwcG9ydCBob3Rzd2FwJztcclxufSJdfQ==