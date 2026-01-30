---
inclusion: always
---

# Trinity Tech Stack Guidelines

## Infrastructure as Code (IaC)
- **AWS CDK v2** (TypeScript) for all infrastructure
- **Region**: ALWAYS eu-west-1
- **Stacks**: Modular approach with separate stacks for different concerns

## Database
- **Amazon DynamoDB** with Single Table Design for new features
- **Billing Mode**: PAY_PER_REQUEST for all tables
- **Streams**: Enable for event-driven patterns
- **TTL**: Configure where appropriate for data lifecycle

## API Layer
- **AWS AppSync** (GraphQL) for all client communication
- **APPSYNC_JS** runtime for resolvers (preferred over VTL)
- **Enhanced Subscription Filtering** for real-time updates
- **IAM Authorization** for backend-to-backend communication

## Compute
- **AWS Lambda** (Node.js 18.x or 20.x) for business logic
- **Event-Driven Architecture** using DynamoDB Streams
- **Async Processing** for complex workflows

## Real-Time Architecture Pattern
```
Client Mutation -> AppSync -> DynamoDB -> Stream -> Lambda -> AppSync Mutation -> Subscription
```

## Security
- **AWS Cognito** for user authentication
- **JWT tokens** with proper validation
- **@aws_iam** directive for backend mutations
- **Least privilege** IAM policies

## Development Standards
- **TypeScript** for CDK and Lambda functions
- **Conventional Commits** for version control
- **Property-based testing** for critical logic
- **Comprehensive error handling** with retries

## Naming Conventions
- **Lambdas**: `trinity-[purpose]-dev`
- **Tables**: `trinity-[entity]-dev[-version]`
- **Stacks**: `Trinity[Purpose]Stack`
- **APIs**: `trinity-[purpose]-api`