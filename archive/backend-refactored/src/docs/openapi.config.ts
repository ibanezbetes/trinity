/**
 * OpenAPI/Swagger Configuration
 * Comprehensive API documentation setup
 */

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Trinity Backend API')
    .setDescription(`
# Trinity Backend Refactored API

## Overview
Trinity is a real-time movie voting application that allows users to create rooms, invite friends, and vote on movies together. This API provides all the necessary endpoints for authentication, room management, voting, and real-time communication.

## Architecture
- **Clean Architecture**: Hexagonal architecture with clear separation of concerns
- **Real-time**: WebSocket-based real-time communication
- **Serverless**: AWS Lambda-based deployment
- **GraphQL**: AppSync integration for mobile compatibility
- **Security**: JWT-based authentication with AWS Cognito

## Key Features
- 🔐 **Authentication**: Google OAuth + AWS Cognito integration
- 🏠 **Room Management**: Create, join, and manage voting rooms
- 🎬 **Movie Integration**: TMDB API integration for movie data
- 🗳️ **Real-time Voting**: Live voting with instant results
- 📱 **Mobile Compatible**: Full React Native app support
- 🔄 **Migration System**: Automated legacy system migration
- 📊 **Quality Assurance**: Comprehensive testing and monitoring

## Getting Started
1. Ensure you have valid AWS credentials configured
2. Install dependencies: \`npm install\`
3. Run tests: \`npm test\`
4. Start development server: \`npm run start:dev\`
5. Access API docs: \`http://localhost:3000/api/docs\`

## Authentication
Most endpoints require authentication via JWT tokens. Include the token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting
API endpoints are rate-limited to prevent abuse:
- Authentication endpoints: 5 requests per minute
- Room operations: 10 requests per minute
- Voting operations: 20 requests per minute
- General endpoints: 100 requests per minute

## Error Handling
All errors follow a consistent format:
\`\`\`json
{
  "statusCode": 400,
  "message": "Detailed error message",
  "error": "Bad Request",
  "timestamp": "2024-01-25T12:00:00.000Z",
  "path": "/api/endpoint"
}
\`\`\`

## WebSocket Events
Real-time communication uses WebSocket events:
- \`room:joined\` - User joined a room
- \`room:left\` - User left a room
- \`vote:cast\` - New vote was cast
- \`vote:results\` - Voting results updated
- \`room:message\` - Chat message in room
- \`typing:start\` - User started typing
- \`typing:stop\` - User stopped typing

## Support
For support and questions:
- GitHub Issues: [Repository Issues](https://github.com/trinity/backend-refactored/issues)
- Documentation: [Full Documentation](https://trinity-docs.example.com)
- Email: support@trinity.example.com
    `)
    .setVersion('2.0.0')
    .setContact(
      'Trinity Team',
      'https://trinity.example.com',
      'support@trinity.example.com'
    )
    .setLicense(
      'MIT',
      'https://github.com/trinity/backend-refactored/blob/main/LICENSE'
    )
    .addServer('http://localhost:3000', 'Development Server')
    .addServer('https://api-staging.trinity.example.com', 'Staging Server')
    .addServer('https://api.trinity.example.com', 'Production Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth'
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API Key for service-to-service communication',
      },
      'API-Key'
    )
    .addTag('Authentication', 'User authentication and authorization')
    .addTag('Rooms', 'Room management and operations')
    .addTag('Voting', 'Voting operations and results')
    .addTag('Movies', 'Movie data and search')
    .addTag('Users', 'User profile and preferences')
    .addTag('Real-time', 'WebSocket and real-time operations')
    .addTag('Analytics', 'Analytics and reporting')
    .addTag('Quality', 'Code quality and monitoring')
    .addTag('Migration', 'System migration operations')
    .addTag('Health', 'Health checks and system status')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true,
  });

  // Customize the document
  document.info.termsOfService = 'https://trinity.example.com/terms';
  document.externalDocs = {
    description: 'Find more info here',
    url: 'https://trinity-docs.example.com',
  };

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Trinity API Documentation',
    customfavIcon: '/favicon.ico',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #1976d2 }
      .swagger-ui .scheme-container { background: #fafafa; padding: 15px; border-radius: 4px; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      docExpansion: 'none',
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
    },
  });
}