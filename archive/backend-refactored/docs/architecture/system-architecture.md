# Trinity System Architecture

## Overview

Trinity Backend Refactored follows a clean, hexagonal architecture pattern with clear separation of concerns, enabling maintainability, testability, and scalability.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Mobile[React Native App]
        Web[Web Interface]
        API[API Clients]
    end

    subgraph "API Gateway"
        ALB[Application Load Balancer]
        Auth[Authentication Layer]
        RateLimit[Rate Limiting]
    end

    subgraph "Application Layer"
        Controllers[Controllers]
        Services[Business Services]
        UseCases[Use Cases]
    end

    subgraph "Domain Layer"
        Entities[Domain Entities]
        ValueObjects[Value Objects]
        DomainServices[Domain Services]
        Repositories[Repository Interfaces]
    end

    subgraph "Infrastructure Layer"
        WebSocket[WebSocket Gateway]
        Database[DynamoDB]
        Cache[Redis Cache]
        Queue[SQS Queues]
        Storage[S3 Storage]
        External[External APIs]
    end

    subgraph "AWS Services"
        Cognito[AWS Cognito]
        Lambda[AWS Lambda]
        AppSync[AWS AppSync]
        CloudWatch[CloudWatch]
        SNS[SNS Notifications]
    end

    Mobile --> ALB
    Web --> ALB
    API --> ALB

    ALB --> Auth
    Auth --> RateLimit
    RateLimit --> Controllers

    Controllers --> Services
    Services --> UseCases
    UseCases --> Entities
    UseCases --> DomainServices

    DomainServices --> Repositories
    Repositories --> Database
    Repositories --> Cache

    Services --> WebSocket
    Services --> Queue
    Services --> Storage
    Services --> External

    Auth --> Cognito
    Controllers --> Lambda
    WebSocket --> AppSync
    Services --> CloudWatch
    Queue --> SNS
```

## Clean Architecture Layers

### 1. Domain Layer (Core Business Logic)

```mermaid
graph LR
    subgraph "Domain Layer"
        User[User Entity]
        Room[Room Entity]
        Vote[Vote Entity]
        Movie[Movie Entity]
        
        UserRepo[IUserRepository]
        RoomRepo[IRoomRepository]
        VoteRepo[IVoteRepository]
        
        AuthService[AuthDomainService]
        VotingService[VotingDomainService]
        RoomService[RoomDomainService]
    end

    User --> UserRepo
    Room --> RoomRepo
    Vote --> VoteRepo
    
    AuthService --> User
    VotingService --> Vote
    RoomService --> Room
```

**Responsibilities:**
- Core business entities and value objects
- Business rules and domain logic
- Repository interfaces (ports)
- Domain services for complex business operations

### 2. Application Layer (Use Cases)

```mermaid
graph TB
    subgraph "Application Layer"
        CreateRoom[CreateRoomUseCase]
        JoinRoom[JoinRoomUseCase]
        CastVote[CastVoteUseCase]
        AuthUser[AuthenticateUserUseCase]
        
        RoomController[RoomController]
        VoteController[VoteController]
        AuthController[AuthController]
    end

    RoomController --> CreateRoom
    RoomController --> JoinRoom
    VoteController --> CastVote
    AuthController --> AuthUser
```

**Responsibilities:**
- Application-specific business rules
- Orchestrates domain objects
- Defines use cases and workflows
- Handles application services

### 3. Infrastructure Layer (External Concerns)

```mermaid
graph TB
    subgraph "Infrastructure Layer"
        DynamoRepo[DynamoDBRepository]
        RedisCache[RedisCacheService]
        CognitoAuth[CognitoAuthService]
        TMDBService[TMDBMovieService]
        WebSocketGateway[WebSocketGateway]
        
        subgraph "AWS Services"
            DynamoDB[(DynamoDB)]
            Redis[(Redis)]
            Cognito[AWS Cognito]
            TMDB[TMDB API]
        end
    end

    DynamoRepo --> DynamoDB
    RedisCache --> Redis
    CognitoAuth --> Cognito
    TMDBService --> TMDB
```

**Responsibilities:**
- Database implementations
- External service integrations
- Infrastructure concerns
- Framework-specific code

## Data Flow Architecture

```mermaid
sequenceDiagram
    participant Client
    participant Controller
    participant UseCase
    participant DomainService
    participant Repository
    participant Database

    Client->>Controller: HTTP Request
    Controller->>UseCase: Execute Use Case
    UseCase->>DomainService: Business Logic
    DomainService->>Repository: Data Access
    Repository->>Database: Query/Command
    Database-->>Repository: Result
    Repository-->>DomainService: Domain Object
    DomainService-->>UseCase: Business Result
    UseCase-->>Controller: Application Result
    Controller-->>Client: HTTP Response
```

## Real-time Communication Architecture

```mermaid
graph TB
    subgraph "Real-time Layer"
        WSGateway[WebSocket Gateway]
        RedisAdapter[Redis Adapter]
        RoomManager[Room Manager]
        ConnectionManager[Connection Manager]
    end

    subgraph "Message Flow"
        Client1[Client 1]
        Client2[Client 2]
        Client3[Client 3]
    end

    subgraph "Infrastructure"
        Redis[(Redis Pub/Sub)]
        AppSync[AWS AppSync]
    end

    Client1 --> WSGateway
    Client2 --> WSGateway
    Client3 --> WSGateway

    WSGateway --> RedisAdapter
    WSGateway --> RoomManager
    WSGateway --> ConnectionManager

    RedisAdapter --> Redis
    RoomManager --> AppSync
    ConnectionManager --> Redis
```

## Migration System Architecture

```mermaid
graph TB
    subgraph "Migration System"
        Orchestrator[Migration Orchestrator]
        AnalysisEngine[Analysis Engine]
        ExecutionEngine[Execution Engine]
        RollbackService[Rollback Service]
    end

    subgraph "Legacy System"
        LegacyDB[(Legacy Database)]
        LegacyAPI[Legacy API]
        LegacyFiles[Legacy Files]
    end

    subgraph "New System"
        NewDB[(DynamoDB)]
        NewAPI[New API]
        NewServices[New Services]
    end

    Orchestrator --> AnalysisEngine
    Orchestrator --> ExecutionEngine
    Orchestrator --> RollbackService

    AnalysisEngine --> LegacyDB
    AnalysisEngine --> LegacyAPI
    AnalysisEngine --> LegacyFiles

    ExecutionEngine --> NewDB
    ExecutionEngine --> NewAPI
    ExecutionEngine --> NewServices

    RollbackService --> LegacyDB
    RollbackService --> NewDB
```

## Quality Assurance Architecture

```mermaid
graph TB
    subgraph "Quality System"
        QualityService[Quality Service]
        CodeEnforcer[Code Quality Enforcer]
        SecurityScanner[Security Scanner]
        MetricsGenerator[Metrics Generator]
    end

    subgraph "Quality Gates"
        PreCommit[Pre-commit Hooks]
        PrePush[Pre-push Hooks]
        CI[CI/CD Pipeline]
        Deployment[Deployment Gates]
    end

    subgraph "Reporting"
        Reports[Quality Reports]
        Dashboard[Quality Dashboard]
        Alerts[Quality Alerts]
    end

    QualityService --> CodeEnforcer
    QualityService --> SecurityScanner
    QualityService --> MetricsGenerator

    PreCommit --> QualityService
    PrePush --> QualityService
    CI --> QualityService
    Deployment --> QualityService

    QualityService --> Reports
    QualityService --> Dashboard
    QualityService --> Alerts
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        Dev[Developer]
        Git[Git Repository]
        Tests[Automated Tests]
    end

    subgraph "CI/CD Pipeline"
        GHA[GitHub Actions]
        QualityGates[Quality Gates]
        Build[Build Process]
        Deploy[Deployment]
    end

    subgraph "AWS Infrastructure"
        Lambda[Lambda Functions]
        DynamoDB[(DynamoDB)]
        AppSync[AppSync API]
        CloudWatch[CloudWatch]
        S3[S3 Storage]
    end

    subgraph "Monitoring"
        Metrics[Metrics Collection]
        Alerts[Alert System]
        Logs[Log Aggregation]
    end

    Dev --> Git
    Git --> GHA
    GHA --> Tests
    Tests --> QualityGates
    QualityGates --> Build
    Build --> Deploy

    Deploy --> Lambda
    Deploy --> DynamoDB
    Deploy --> AppSync
    Deploy --> CloudWatch
    Deploy --> S3

    Lambda --> Metrics
    DynamoDB --> Metrics
    AppSync --> Metrics
    CloudWatch --> Alerts
    CloudWatch --> Logs
```

## Security Architecture

```mermaid
graph TB
    subgraph "Security Layers"
        WAF[Web Application Firewall]
        Auth[Authentication Layer]
        AuthZ[Authorization Layer]
        Encryption[Data Encryption]
    end

    subgraph "Identity Management"
        Cognito[AWS Cognito]
        JWT[JWT Tokens]
        OAuth[OAuth 2.0]
        MFA[Multi-Factor Auth]
    end

    subgraph "Data Protection"
        TLS[TLS/HTTPS]
        KMS[AWS KMS]
        Secrets[Secrets Manager]
        IAM[IAM Roles]
    end

    WAF --> Auth
    Auth --> AuthZ
    AuthZ --> Encryption

    Auth --> Cognito
    Auth --> JWT
    Auth --> OAuth
    Auth --> MFA

    Encryption --> TLS
    Encryption --> KMS
    Encryption --> Secrets
    Encryption --> IAM
```

## Performance Architecture

```mermaid
graph TB
    subgraph "Performance Optimization"
        CDN[CloudFront CDN]
        Cache[Redis Cache]
        DB[Database Optimization]
        Lambda[Lambda Optimization]
    end

    subgraph "Monitoring"
        APM[Application Performance Monitoring]
        Metrics[Performance Metrics]
        Alerts[Performance Alerts]
        Benchmarks[Performance Benchmarks]
    end

    subgraph "Scaling"
        AutoScale[Auto Scaling]
        LoadBalance[Load Balancing]
        Throttling[Rate Throttling]
        Circuit[Circuit Breakers]
    end

    CDN --> Cache
    Cache --> DB
    DB --> Lambda

    Lambda --> APM
    APM --> Metrics
    Metrics --> Alerts
    Alerts --> Benchmarks

    AutoScale --> LoadBalance
    LoadBalance --> Throttling
    Throttling --> Circuit
```

## Key Architectural Decisions

### 1. Clean Architecture
- **Decision**: Implement hexagonal architecture
- **Rationale**: Separation of concerns, testability, maintainability
- **Trade-offs**: Initial complexity vs long-term benefits

### 2. Serverless-First
- **Decision**: Use AWS Lambda for compute
- **Rationale**: Cost efficiency, automatic scaling, reduced operations
- **Trade-offs**: Cold starts vs operational simplicity

### 3. Event-Driven Architecture
- **Decision**: Use events for real-time communication
- **Rationale**: Scalability, loose coupling, real-time requirements
- **Trade-offs**: Complexity vs performance

### 4. NoSQL Database
- **Decision**: Use DynamoDB as primary database
- **Rationale**: Serverless compatibility, performance, AWS integration
- **Trade-offs**: Query flexibility vs performance and cost

### 5. GraphQL + REST Hybrid
- **Decision**: Support both GraphQL (mobile) and REST (web)
- **Rationale**: Mobile app compatibility, flexibility
- **Trade-offs**: Maintenance overhead vs compatibility

## Quality Attributes

### Scalability
- Horizontal scaling through serverless architecture
- Auto-scaling based on demand
- Stateless design for easy scaling

### Performance
- Sub-100ms API response times
- Real-time WebSocket communication
- Efficient caching strategies

### Security
- Zero-trust security model
- End-to-end encryption
- Comprehensive audit logging

### Reliability
- 99.9% uptime target
- Automated failover mechanisms
- Comprehensive monitoring and alerting

### Maintainability
- Clean architecture principles
- Comprehensive test coverage (>80%)
- Automated quality gates

### Observability
- Distributed tracing
- Comprehensive logging
- Real-time metrics and dashboards