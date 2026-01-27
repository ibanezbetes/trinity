import { Module, forwardRef } from '@nestjs/common';
import { RoomThemeService } from './room-theme.service';
import {
  RoomThemeController,
  RoomThemeManagementController,
} from './room-theme.controller';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RoomModule } from '../room/room.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    DatabaseModule,
    RoomModule, // Para verificar acceso a salas
    AnalyticsModule, // Para tracking de eventos
    forwardRef(() => RealtimeModule), // Para notificaciones en tiempo real
  ],
  controllers: [RoomThemeController, RoomThemeManagementController],
  providers: [RoomThemeService],
  exports: [RoomThemeService], // Exportar para uso en otros módulos
})
export class RoomThemeModule {}
