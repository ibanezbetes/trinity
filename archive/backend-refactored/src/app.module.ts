import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getAppConfig } from './infrastructure/config/app.config';
import { AnalysisModule } from './domain/analysis.module';
import { MigrationModule } from './domain/migration.module';
import { AnalysisController } from './application/controllers/analysis.controller';
import { MigrationController } from './application/controllers/migration.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [getAppConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    AnalysisModule,
    MigrationModule,
  ],
  controllers: [AppController, AnalysisController, MigrationController],
  providers: [AppService],
})
export class AppModule {}
