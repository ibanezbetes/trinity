# Trinity Backend Refactored

[![Build Status](https://github.com/trinity/backend-refactored/workflows/CI/badge.svg)](https://github.com/trinity/backend-refactored/actions)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=trinity-backend&metric=alert_status)](https://sonarcloud.io/dashboard?id=trinity-backend)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=trinity-backend&metric=coverage)](https://sonarcloud.io/dashboard?id=trinity-backend)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, serverless backend for Trinity - a real-time movie voting application built with clean architecture principles.

## 🎯 Overview

Trinity Backend Refactored is a complete rewrite of the Trinity movie voting platform, designed with:

- **Clean Architecture**: Hexagonal architecture with clear separation of concerns
- **Serverless-First**: AWS Lambda-based deployment for cost efficiency and scalability
- **Real-time Communication**: WebSocket and GraphQL subscriptions for live updates
- **Type Safety**: Full TypeScript implementation with strict type checking
- **Quality Assurance**: Comprehensive testing with property-based testing
- **DevOps Ready**: Complete CI/CD pipeline with automated quality gates

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or 20.x
- npm 9.x+
- Docker & Docker Compose
- AWS CLI configured
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/trinity/backend-refactored.git
cd backend-refactored

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start local services
docker-compose up -d

# Run database migrations
npm run db:migrate

# Start development server
npm run start:dev
```

The API will be available at `http://localhost:3000`

### API Documentation

- **Swagger UI**: http://localhost:3000/api/docs
- **GraphQL Playground**: http://localhost:3000/graphql
- **API Reference**: [docs/api/api-reference.md](docs/api/api-reference.md)

## 🏗️ Architecture

Trinity follows Clean Architecture principles with four main layers:

```
┌─────────────────────────────────────────┐
│             Presentation Layer          │
│  Controllers, WebSocket, GraphQL        │
├─────────────────────────────────────────┤
│             Application Layer           │
│     Use Cases, Application Services     │
├─────────────────────────────────────────┤
│               Domain Layer              │
│   Entities, Value Objects, Services     │
├─────────────────────────────────────────┤
│            Infrastructure Layer         │
│  Database, External APIs, Framework     │
└─────────────────────────────────────────┘
```

### Key Components

- **Domain Entities**: User, Room, Vote, Movie
- **Use Cases**: CreateRoom, JoinRoom, CastVote, AuthenticateUser
- **Infrastructure**: DynamoDB, Redis, AWS Cognito, TMDB API
- **Real-time**: WebSocket Gateway with Redis pub/sub

## 🛠️ Technology Stack

### Core Technologies
- **Runtime**: Node.js 18.x
- **Language**: TypeScript 5.x
- **Framework**: NestJS 10.x
- **Database**: DynamoDB (primary), Redis (cache)
- **Authentication**: AWS Cognito + JWT
- **Real-time**: WebSocket + GraphQL Subscriptions

### AWS Services
- **Compute**: AWS Lambda
- **Database**: DynamoDB, ElastiCache (Redis)
- **API**: API Gateway, AppSync (GraphQL)
- **Auth**: Cognito User Pools
- **Storage**: S3
- **Monitoring**: CloudWatch, X-Ray
- **CDN**: CloudFront

### Development Tools
- **Testing**: Jest, fast-check (property-based testing)
- **Code Quality**: ESLint, Prettier, SonarQube
- **Documentation**: OpenAPI/Swagger, TypeDoc
- **CI/CD**: GitHub Actions
- **Infrastructure**: AWS CDK

## 📁 Project Structure

```
backend-refactored/
├── src/
│   ├── domain/                 # Domain layer (business logic)
│   │   ├── entities/          # Domain entities
│   │   ├── services/          # Domain services
│   │   └── repositories/      # Repository interfaces
│   ├── application/           # Application layer (use cases)
│   │   ├── use-cases/        # Application use cases
│   │   ├── dto/              # Data transfer objects
│   │   └── ports/            # Application ports
│   ├── infrastructure/       # Infrastructure layer
│   │   ├── database/         # Database implementations
│   │   ├── external-apis/    # External service adapters
│   │   ├── websocket/        # WebSocket implementation
│   │   └── config/           # Configuration
│   ├── presentation/         # Presentation layer
│   │   ├── controllers/      # HTTP controllers
│   │   ├── graphql/          # GraphQL resolvers
│   │   └── middleware/       # HTTP middleware
│   ├── quality/              # Quality assurance system
│   └── docs/                 # OpenAPI configuration
├── docs/                     # Documentation
│   ├── architecture/         # Architecture documentation
│   ├── api/                  # API documentation
│   └── setup/                # Setup guides
├── test/                     # E2E tests
├── infrastructure/           # AWS CDK infrastructure
└── scripts/                  # Utility scripts
```

## 🧪 Testing

Trinity uses a comprehensive testing strategy:

### Test Types
- **Unit Tests**: Domain logic and services
- **Integration Tests**: Use cases and infrastructure
- **Property-Based Tests**: Complex business rules
- **E2E Tests**: Complete user workflows

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:cov

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e

# Run property-based tests
npm run test:property

# Run tests in watch mode
npm run test:watch
```

### Quality Gates

```bash
# Run comprehensive quality checks
npm run quality:check

# Enforce quality gates (used in CI/CD)
npm run quality:gates

# Generate quality metrics
npm run quality:metrics
```

## 🚀 Deployment

### Environments

| Environment | Branch | URL |
|-------------|--------|-----|
| Development | feature/* | Local development |
| Staging | develop | https://api-staging.trinity.example.com |
| Production | main | https://api.trinity.example.com |

### Deployment Commands

```bash
# Deploy to development
npm run deploy:dev

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod

# View deployment diff
npm run deploy:diff

# Rollback deployment
npm run deploy:rollback
```

### CI/CD Pipeline

The project uses GitHub Actions for automated deployment:

1. **Quality Checks**: Linting, type checking, testing
2. **Security Scan**: Vulnerability scanning
3. **Build**: TypeScript compilation and bundling
4. **Deploy**: AWS CDK deployment
5. **Smoke Tests**: Post-deployment validation

## 📊 Monitoring & Observability

### Metrics & Logging
- **Application Metrics**: Custom CloudWatch metrics
- **Performance Monitoring**: AWS X-Ray distributed tracing
- **Log Aggregation**: CloudWatch Logs with structured logging
- **Error Tracking**: Automated error alerting

### Health Checks
```bash
# Check application health
curl http://localhost:3000/health

# Check database connectivity
npm run health:db

# Check external services
npm run health:external
```

### Dashboards
- **Application Dashboard**: CloudWatch dashboard for key metrics
- **Quality Dashboard**: Code quality and test coverage metrics
- **Performance Dashboard**: Response times and error rates

## 🔒 Security

### Authentication & Authorization
- **JWT Tokens**: Stateless authentication
- **AWS Cognito**: User management and OAuth integration
- **Role-Based Access**: Fine-grained permissions
- **Rate Limiting**: API abuse prevention

### Security Measures
- **Input Validation**: Comprehensive request validation
- **SQL Injection Prevention**: Parameterized queries
- **CORS Configuration**: Proper cross-origin settings
- **Security Headers**: Helmet.js security headers
- **Dependency Scanning**: Automated vulnerability scanning

### Security Scanning
```bash
# Run security audit
npm run security:scan

# Fix security vulnerabilities
npm run security:fix

# Generate security report
npm run security:report
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes following our coding standards
4. **Test** your changes: `npm run quality:check`
5. **Commit** your changes: `git commit -m 'feat: add amazing feature'`
6. **Push** to the branch: `git push origin feature/amazing-feature`
7. **Open** a Pull Request

### Coding Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Comprehensive linting rules
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Standardized commit messages
- **Clean Architecture**: Follow established patterns

## 📚 Documentation

### Architecture Documentation
- [System Architecture](docs/architecture/system-architecture.md)
- [Architecture Decision Records](docs/architecture/decisions/)
- [Clean Architecture Guide](docs/architecture/clean-architecture.md)

### Setup & Deployment
- [Development Setup](docs/setup/development-setup.md)
- [Deployment Guide](docs/setup/deployment-guide.md)
- [Environment Configuration](docs/setup/environment-config.md)

### API Documentation
- [API Reference](docs/api/api-reference.md)
- [GraphQL Schema](docs/api/graphql-schema.md)
- [WebSocket Events](docs/api/websocket-events.md)

### Quality Assurance
- [Testing Strategy](docs/quality/testing-strategy.md)
- [Quality Gates](docs/quality/quality-gates.md)
- [Code Standards](docs/quality/code-standards.md)

## 🔧 Scripts Reference

### Development
```bash
npm run start:dev          # Start development server
npm run start:debug        # Start with debugging
npm run build              # Build for production
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
```

### Testing
```bash
npm test                   # Run all tests
npm run test:unit          # Run unit tests only
npm run test:integration   # Run integration tests
npm run test:e2e           # Run end-to-end tests
npm run test:cov           # Run tests with coverage
```

### Quality
```bash
npm run quality:check      # Run quality checks
npm run quality:gates      # Enforce quality gates
npm run quality:metrics    # Generate quality metrics
npm run security:scan      # Security vulnerability scan
```

### Database
```bash
npm run db:migrate         # Run database migrations
npm run db:seed            # Seed test data
npm run db:reset           # Reset database
```

### Deployment
```bash
npm run deploy:dev         # Deploy to development
npm run deploy:staging     # Deploy to staging
npm run deploy:prod        # Deploy to production
npm run deploy:rollback    # Rollback deployment
```

## 📈 Performance

### Benchmarks
- **API Response Time**: < 100ms (95th percentile)
- **WebSocket Latency**: < 50ms
- **Database Queries**: < 10ms (DynamoDB)
- **Cold Start**: < 1s (Lambda)

### Optimization Features
- **Connection Pooling**: Reuse database connections
- **Caching**: Redis caching for frequently accessed data
- **CDN**: CloudFront for static assets
- **Compression**: Gzip compression for API responses

## 🐛 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

#### Database Connection Issues
```bash
# Check DynamoDB Local
docker-compose logs dynamodb-local

# Restart services
docker-compose restart
```

#### AWS Credentials
```bash
# Check AWS configuration
aws configure list

# Test AWS access
aws sts get-caller-identity
```

### Getting Help
- **Documentation**: Check the `docs/` directory
- **Issues**: [GitHub Issues](https://github.com/trinity/backend-refactored/issues)
- **Discussions**: [GitHub Discussions](https://github.com/trinity/backend-refactored/discussions)
- **Email**: support@trinity.example.com

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **NestJS Team**: For the excellent framework
- **AWS**: For the serverless platform
- **Clean Architecture Community**: For architectural guidance
- **Contributors**: All the amazing people who contributed to this project

## 📊 Project Stats

![GitHub stars](https://img.shields.io/github/stars/trinity/backend-refactored?style=social)
![GitHub forks](https://img.shields.io/github/forks/trinity/backend-refactored?style=social)
![GitHub issues](https://img.shields.io/github/issues/trinity/backend-refactored)
![GitHub pull requests](https://img.shields.io/github/issues-pr/trinity/backend-refactored)

---

**Built with ❤️ by the Trinity Team**