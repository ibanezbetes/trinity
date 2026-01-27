/**
 * Swagger/OpenAPI Configuration
 * Automated API documentation generation
 */

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Trinity Backend API')
    .setDescription(`
# Trinity Backend Refactored API

Esta es la documentación completa de la API del backend refactorizado de Trinity.

## Características

- **Arquitectura Limpia**: Implementación con hexagonal architecture
- **Real-time**: WebSocket y AppSync para funcionalidad en tiempo real
- **Seguridad**: Autenticación con Google OAuth y AWS Cognito
- **Escalabilidad**: Infraestructura serverless con AWS Lambda
- **Calidad**: Sistema completo de quality assurance automatizado

## Autenticación

La API utiliza JWT tokens para autenticación. Incluye el token en el header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting

- **Límite general**: 1000 requests por hora por IP
- **Límite de autenticación**: 10 intentos por minuto
- **Límite de voting**: 100 votos por minuto por usuario

## Códigos de Error

- **400**: Bad Request - Datos de entrada inválidos
- **401**: Unauthorized - Token de autenticación requerido
- **403**: Forbidden - Permisos insuficientes
- **404**: Not Found - Recurso no encontrado
- **429**: Too Many Requests - Rate limit excedido
- **500**: Internal Server Error - Error interno del servidor

## Versionado

La API utiliza versionado semántico. La versión actual es v2.0.0.

## Soporte

Para soporte técnico, contacta al equipo de desarrollo.
    `)
    .setVersion('2.0.0')
    .setContact(
      'Trinity Development Team',
      'https://github.com/trinity/backend-refactored',
      'dev@trinity.com'
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3000', 'Development Server')
    .addServer('https://api-dev.trinity.com', 'Development Environment')
    .addServer('https://api-staging.trinity.com', 'Staging Environment')
    .addServer('https://api.trinity.com', 'Production Environment')
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
    .addTag('Voting', 'Voting system and real-time updates')
    .addTag('Users', 'User profile and preferences')
    .addTag('Media', 'Movie and media content management')
    .addTag('Real-time', 'WebSocket and real-time features')
    .addTag('Quality', 'Code quality and monitoring')
    .addTag('Health', 'System health and monitoring')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true,
  });

  // Customize the document
  document.info.termsOfService = 'https://trinity.com/terms';
  document.externalDocs = {
    description: 'Trinity Documentation',
    url: 'https://docs.trinity.com',
  };

  // Add custom schemas
  document.components = {
    ...document.components,
    examples: {
      UserExample: {
        summary: 'Example user',
        value: {
          id: 'user-123',
          email: 'user@example.com',
          displayName: 'John Doe',
          avatarUrl: 'https://example.com/avatar.jpg',
          preferences: {
            theme: 'dark',
            notifications: true,
            language: 'en',
          },
        },
      },
      RoomExample: {
        summary: 'Example room',
        value: {
          id: 'room-456',
          name: 'Movie Night',
          description: 'Weekly movie voting session',
          hostId: 'user-123',
          isActive: true,
          participants: ['user-123', 'user-456'],
          settings: {
            maxParticipants: 10,
            votingDuration: 300,
            allowAnonymous: false,
          },
        },
      },
      VoteExample: {
        summary: 'Example vote',
        value: {
          id: 'vote-789',
          roomId: 'room-456',
          userId: 'user-123',
          movieId: 'movie-101',
          rating: 8.5,
          timestamp: '2024-01-15T10:30:00Z',
        },
      },
    },
  };

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Trinity API Documentation',
    customfavIcon: '/favicon.ico',
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { color: #1976d2; }
      .swagger-ui .scheme-container { background: #fafafa; padding: 15px; }
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