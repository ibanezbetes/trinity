import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configurar CORS
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://your-frontend-domain.com']
        : [
            'http://localhost:3000', 
            'http://localhost:19006', // React Native Metro
            'http://192.168.0.27:8081', // Expo Go
            'exp://192.168.0.27:8081', // Expo protocol
          ],
    credentials: true,
  });

  // Configurar validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Eliminar propiedades no definidas en DTOs
      forbidNonWhitelisted: true, // Lanzar error si hay propiedades no permitidas
      transform: true, // Transformar automáticamente tipos
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Configurar Swagger
  const config = new DocumentBuilder()
    .setTitle('Trinity API')
    .setDescription(
      'API para la plataforma Trinity de descubrimiento de contenido multimedia',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3002;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Trinity API ejecutándose en http://localhost:${port}`);
  console.log(`🌐 También disponible en http://192.168.0.27:${port}`);
  console.log(
    `📚 Documentación disponible en http://localhost:${port}/api/docs`,
  );
}

bootstrap();
