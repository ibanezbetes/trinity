# Development Setup Guide

This guide will help you set up the Trinity Backend Refactored project for local development.

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18.x or 20.x | Runtime environment |
| npm | 9.x+ | Package manager |
| Docker | 20.x+ | Local services |
| Docker Compose | 2.x+ | Service orchestration |
| AWS CLI | 2.x+ | AWS service interaction |
| Git | 2.x+ | Version control |

### Optional Tools

| Tool | Purpose |
|------|---------|
| VS Code | Recommended IDE |
| Postman | API testing |
| DynamoDB Admin | Database GUI |
| Redis Commander | Redis GUI |

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/trinity/backend-refactored.git
cd backend-refactored
```

### 2. Install Dependencies

```bash
# Install project dependencies
npm install

# Install global tools (optional)
npm install -g @aws-cdk/cli
npm install -g typescript
npm install -g ts-node
```

### 3. Environment Configuration

#### Create Environment Files

```bash
# Copy environment templates
cp .env.example .env
cp .env.development.example .env.development
```

#### Configure Environment Variables

Edit `.env` file:

```bash
# Application Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=default

# Database Configuration
DYNAMODB_ENDPOINT=http://localhost:8000
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-jwt-secret-here
COGNITO_USER_POOL_ID=your-user-pool-id
COGNITO_CLIENT_ID=your-client-id

# External APIs
TMDB_API_KEY=your-tmdb-api-key
TMDB_BASE_URL=https://api.themoviedb.org/3

# Feature Flags
ENABLE_WEBSOCKETS=true
ENABLE_GRAPHQL=true
ENABLE_ANALYTICS=false
```

### 4. AWS Configuration

#### Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

#### Create AWS Resources (Optional)

For full AWS integration:

```bash
# Deploy development stack
npm run cdk:deploy:dev

# Or use LocalStack for local AWS services
docker-compose up -d localstack
```

### 5. Local Services Setup

#### Start Local Services

```bash
# Start all local services
docker-compose up -d

# Or start individual services
docker-compose up -d dynamodb-local
docker-compose up -d redis
docker-compose up -d localstack
```

#### Verify Services

```bash
# Check DynamoDB
aws dynamodb list-tables --endpoint-url http://localhost:8000

# Check Redis
redis-cli -h localhost -p 6379 ping

# Check LocalStack
curl http://localhost:4566/health
```

### 6. Database Setup

#### Create DynamoDB Tables

```bash
# Create development tables
npm run db:create:dev

# Or manually create tables
npm run db:migrate
```

#### Seed Test Data

```bash
# Seed development data
npm run db:seed:dev

# Create test users and rooms
npm run db:seed:test-data
```

## Development Workflow

### 1. Start Development Server

```bash
# Start in development mode
npm run start:dev

# Start with debugging
npm run start:debug

# Start with file watching
npm run start:dev --watch
```

### 2. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

### 3. Code Quality Checks

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Run type checking
npm run type-check

# Run quality checks
npm run quality:check
```

### 4. Build and Deploy

```bash
# Build the application
npm run build

# Deploy to development
npm run deploy:dev

# Deploy to staging
npm run deploy:staging
```

## IDE Configuration

### VS Code Setup

#### Recommended Extensions

Create `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-vscode.vscode-docker",
    "amazonwebservices.aws-toolkit-vscode"
  ]
}
```

#### Workspace Settings

Create `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true,
    "**/coverage": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true
  }
}
```

#### Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug NestJS",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/main.ts",
      "args": [],
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "protocol": "inspector",
      "envFile": "${workspaceFolder}/.env"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--no-cache"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "test"
      }
    }
  ]
}
```

## Docker Configuration

### Development Docker Compose

Create `docker-compose.dev.yml`:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
      - "9229:9229" # Debug port
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DYNAMODB_ENDPOINT=http://dynamodb-local:8000
      - REDIS_URL=redis://redis:6379
    depends_on:
      - dynamodb-local
      - redis
    command: npm run start:debug

  dynamodb-local:
    image: amazon/dynamodb-local:latest
    ports:
      - "8000:8000"
    command: ["-jar", "DynamoDBLocal.jar", "-sharedDb", "-inMemory"]

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=lambda,apigateway,s3,sns,sqs,events
      - DEBUG=1
      - DATA_DIR=/tmp/localstack/data
    volumes:
      - "./localstack:/tmp/localstack"
      - "/var/run/docker.sock:/var/run/docker.sock"
```

### Development Dockerfile

Create `Dockerfile.dev`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Expose ports
EXPOSE 3000 9229

# Start development server
CMD ["npm", "run", "start:debug"]
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Or use different port
PORT=3001 npm run start:dev
```

#### DynamoDB Connection Issues
```bash
# Check if DynamoDB Local is running
docker ps | grep dynamodb

# Restart DynamoDB Local
docker-compose restart dynamodb-local

# Check tables
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

#### Redis Connection Issues
```bash
# Check Redis status
docker-compose logs redis

# Test Redis connection
redis-cli -h localhost -p 6379 ping

# Restart Redis
docker-compose restart redis
```

#### AWS Credentials Issues
```bash
# Check AWS configuration
aws configure list

# Test AWS access
aws sts get-caller-identity

# Use different profile
export AWS_PROFILE=development
```

### Performance Issues

#### Slow Tests
```bash
# Run tests in parallel
npm run test -- --maxWorkers=4

# Run specific test file
npm run test -- user.service.spec.ts

# Skip integration tests
npm run test:unit
```

#### High Memory Usage
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Monitor memory usage
npm run start:dev -- --inspect

# Use heap profiler
node --inspect --heap-prof src/main.ts
```

## Development Best Practices

### Code Organization
- Follow Clean Architecture principles
- Use dependency injection
- Write tests for all business logic
- Keep functions small and focused

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/new-feature

# Make commits with conventional format
git commit -m "feat: add user authentication"

# Run quality checks before push
npm run quality:check

# Push and create PR
git push origin feature/new-feature
```

### Testing Strategy
- Write unit tests for domain logic
- Write integration tests for use cases
- Write e2e tests for critical user flows
- Use property-based testing for complex logic

### Documentation
- Update README for new features
- Document API changes in OpenAPI spec
- Create ADRs for architectural decisions
- Keep inline code comments minimal but meaningful

## Next Steps

After completing the setup:

1. **Explore the Codebase**: Start with `src/main.ts` and follow the architecture
2. **Run the Test Suite**: Ensure all tests pass in your environment
3. **Make a Small Change**: Try adding a simple endpoint or test
4. **Read the Documentation**: Review architecture decisions and patterns
5. **Join the Team**: Participate in code reviews and team discussions

## Getting Help

- **Documentation**: Check the `docs/` directory
- **Issues**: Create GitHub issues for bugs or questions
- **Team Chat**: Join the development Slack channel
- **Code Reviews**: Ask for help in pull requests