import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { MemberService } from './member.service';
import { InteractionService } from '../interaction/interaction.service';
import { Member, MemberStatus } from '../../domain/entities/room.entity';

export interface InactivityConfig {
  warningThresholdMinutes: number;
  inactiveThresholdMinutes: number;
  exclusionThresholdMinutes: number;
  enableAutomaticCleanup: boolean;
  notificationEnabled: boolean;
}

export interface InactivityReport {
  roomId: string;
  totalMembers: number;
  activeMembers: number;
  warningMembers: number;
  inactiveMembers: number;
  excludedMembers: number;
  lastCheckAt: Date;
}

export interface MemberActivityStatus {
  userId: string;
  roomId: string;
  status: MemberStatus;
  lastActivityAt: Date;
  minutesSinceActivity: number;
  activityLevel: ActivityLevel;
  shouldExcludeFromVoting: boolean;
}

export enum ActivityLevel {
  ACTIVE = 'active',
  WARNING = 'warning', // Cerca de ser marcado como inactivo
  INACTIVE = 'inactive', // Inactivo pero aún en la sala
  EXCLUDED = 'excluded', // Excluido de votaciones
}

@Injectable()
export class InactiveMemberService {
  private readonly logger = new Logger(InactiveMemberService.name);
  private readonly config: InactivityConfig;

  constructor(
    private dynamoDBService: DynamoDBService,
    private memberService: MemberService,
    private interactionService: InteractionService,
    private configService: ConfigService,
  ) {
    this.config = {
      warningThresholdMinutes: this.configService.get(
        'INACTIVE_WARNING_MINUTES',
        15,
      ),
      inactiveThresholdMinutes: this.configService.get(
        'INACTIVE_THRESHOLD_MINUTES',
        30,
      ),
      exclusionThresholdMinutes: this.configService.get(
        'INACTIVE_EXCLUSION_MINUTES',
        60,
      ),
      enableAutomaticCleanup: this.configService.get(
        'ENABLE_INACTIVE_CLEANUP',
        true,
      ),
      notificationEnabled: this.configService.get(
        'ENABLE_INACTIVE_NOTIFICATIONS',
        true,
      ),
    };
  }

  /**
   * Verificar y actualizar el estado de actividad de todos los miembros de una sala
   */
  async checkRoomMemberActivity(roomId: string): Promise<InactivityReport> {
    try {
      const members = await this.memberService.getRoomMembers(roomId);
      const now = new Date();

      let activeCount = 0;
      let warningCount = 0;
      let inactiveCount = 0;
      let excludedCount = 0;

      const activityStatuses: MemberActivityStatus[] = [];

      for (const member of members) {
        const activityStatus = this.calculateActivityStatus(member, now);
        activityStatuses.push(activityStatus);

        // Actualizar estado del miembro si es necesario
        if (activityStatus.status !== member.status) {
          await this.updateMemberActivityStatus(member, activityStatus.status);
        }

        // Contar por categorías
        switch (activityStatus.activityLevel) {
          case ActivityLevel.ACTIVE:
            activeCount++;
            break;
          case ActivityLevel.WARNING:
            warningCount++;
            break;
          case ActivityLevel.INACTIVE:
            inactiveCount++;
            break;
          case ActivityLevel.EXCLUDED:
            excludedCount++;
            break;
        }
      }

      const report: InactivityReport = {
        roomId,
        totalMembers: members.length,
        activeMembers: activeCount,
        warningMembers: warningCount,
        inactiveMembers: inactiveCount,
        excludedMembers: excludedCount,
        lastCheckAt: now,
      };

      this.logger.log(
        `Activity check for room ${roomId}: ${activeCount} active, ${inactiveCount} inactive, ${excludedCount} excluded`,
      );

      return report;
    } catch (error) {
      this.logger.error(
        `Error checking room member activity: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener miembros activos excluyendo los inactivos según configuración
   */
  async getActiveMembersForVoting(roomId: string): Promise<Member[]> {
    const members = await this.memberService.getRoomMembers(roomId);
    const now = new Date();

    return members.filter((member) => {
      const activityStatus = this.calculateActivityStatus(member, now);
      return !activityStatus.shouldExcludeFromVoting;
    });
  }

  /**
   * Marcar miembro como activo (llamado cuando realiza una acción)
   */
  async markMemberActive(roomId: string, userId: string): Promise<void> {
    try {
      await this.memberService.updateMemberActivity(roomId, userId);
      this.logger.debug(`Member ${userId} marked as active in room ${roomId}`);
    } catch (error) {
      this.logger.error(`Error marking member active: ${error.message}`);
      // No lanzar error, es una operación de background
    }
  }

  /**
   * Obtener estado de actividad de un miembro específico
   */
  async getMemberActivityStatus(
    roomId: string,
    userId: string,
  ): Promise<MemberActivityStatus | null> {
    try {
      const member = await this.memberService.getMember(roomId, userId);
      if (!member) {
        return null;
      }

      return this.calculateActivityStatus(member, new Date());
    } catch (error) {
      this.logger.error(
        `Error getting member activity status: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Limpiar miembros inactivos automáticamente (ejecutado por cron)
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async automaticInactivityCleanup(): Promise<void> {
    if (!this.config.enableAutomaticCleanup) {
      return;
    }

    try {
      this.logger.log('Starting automatic inactivity cleanup...');

      // En una implementación real, obtendríamos todas las salas activas
      // Por ahora, este método está preparado para ser llamado por sala específica

      this.logger.log('Automatic inactivity cleanup completed');
    } catch (error) {
      this.logger.error(
        `Error in automatic inactivity cleanup: ${error.message}`,
      );
    }
  }

  /**
   * Ejecutar limpieza de inactividad para una sala específica
   */
  async cleanupInactiveMembers(roomId: string): Promise<{
    processed: number;
    warned: number;
    markedInactive: number;
    excluded: number;
  }> {
    try {
      const members = await this.memberService.getRoomMembers(roomId);
      const now = new Date();

      let warned = 0;
      let markedInactive = 0;
      let excluded = 0;

      for (const member of members) {
        const activityStatus = this.calculateActivityStatus(member, now);

        // Actualizar estado si cambió
        if (activityStatus.status !== member.status) {
          await this.updateMemberActivityStatus(member, activityStatus.status);

          switch (activityStatus.activityLevel) {
            case ActivityLevel.WARNING:
              warned++;
              break;
            case ActivityLevel.INACTIVE:
              markedInactive++;
              break;
            case ActivityLevel.EXCLUDED:
              excluded++;
              break;
          }
        }
      }

      this.logger.log(
        `Cleanup completed for room ${roomId}: ${warned} warned, ${markedInactive} inactive, ${excluded} excluded`,
      );

      return {
        processed: members.length,
        warned,
        markedInactive,
        excluded,
      };
    } catch (error) {
      this.logger.error(`Error cleaning up inactive members: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reactivar un miembro (cuando vuelve a estar activo)
   */
  async reactivateMember(roomId: string, userId: string): Promise<void> {
    try {
      const member = await this.memberService.getMember(roomId, userId);
      if (!member) {
        throw new Error('Member not found');
      }

      // Actualizar actividad y estado
      await this.memberService.updateMemberActivity(roomId, userId);

      if (member.status !== MemberStatus.ACTIVE) {
        await this.updateMemberActivityStatus(member, MemberStatus.ACTIVE);
      }

      this.logger.log(`Member ${userId} reactivated in room ${roomId}`);
    } catch (error) {
      this.logger.error(`Error reactivating member: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener configuración de inactividad
   */
  getInactivityConfig(): InactivityConfig {
    return { ...this.config };
  }

  /**
   * Actualizar configuración de inactividad
   */
  updateInactivityConfig(newConfig: Partial<InactivityConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.log('Inactivity configuration updated');
  }

  /**
   * Obtener estadísticas de actividad de una sala
   */
  async getRoomActivityStats(roomId: string): Promise<{
    totalMembers: number;
    activeMembers: number;
    inactiveMembers: number;
    averageInactivityMinutes: number;
    mostInactiveMember: {
      userId: string;
      minutesInactive: number;
    } | null;
  }> {
    try {
      const members = await this.memberService.getRoomMembers(roomId);
      const now = new Date();

      let activeCount = 0;
      let inactiveCount = 0;
      let totalInactivityMinutes = 0;
      let mostInactiveMinutes = 0;
      let mostInactiveUserId: string | null = null;

      members.forEach((member) => {
        const activityStatus = this.calculateActivityStatus(member, now);

        if (activityStatus.activityLevel === ActivityLevel.ACTIVE) {
          activeCount++;
        } else {
          inactiveCount++;
          totalInactivityMinutes += activityStatus.minutesSinceActivity;

          if (activityStatus.minutesSinceActivity > mostInactiveMinutes) {
            mostInactiveMinutes = activityStatus.minutesSinceActivity;
            mostInactiveUserId = member.userId;
          }
        }
      });

      const averageInactivityMinutes =
        inactiveCount > 0
          ? Math.round(totalInactivityMinutes / inactiveCount)
          : 0;

      return {
        totalMembers: members.length,
        activeMembers: activeCount,
        inactiveMembers: inactiveCount,
        averageInactivityMinutes,
        mostInactiveMember: mostInactiveUserId
          ? {
              userId: mostInactiveUserId,
              minutesInactive: mostInactiveMinutes,
            }
          : null,
      };
    } catch (error) {
      this.logger.error(`Error getting room activity stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Métodos privados de utilidad
   */
  private calculateActivityStatus(
    member: Member,
    now: Date,
  ): MemberActivityStatus {
    const lastActivity = new Date(member.lastActivityAt);
    const minutesSinceActivity = Math.floor(
      (now.getTime() - lastActivity.getTime()) / (1000 * 60),
    );

    let activityLevel: ActivityLevel;
    let shouldExcludeFromVoting = false;
    let status = member.status;

    if (minutesSinceActivity >= this.config.exclusionThresholdMinutes) {
      activityLevel = ActivityLevel.EXCLUDED;
      shouldExcludeFromVoting = true;
      status = MemberStatus.INACTIVE;
    } else if (minutesSinceActivity >= this.config.inactiveThresholdMinutes) {
      activityLevel = ActivityLevel.INACTIVE;
      shouldExcludeFromVoting = true;
      status = MemberStatus.INACTIVE;
    } else if (minutesSinceActivity >= this.config.warningThresholdMinutes) {
      activityLevel = ActivityLevel.WARNING;
      shouldExcludeFromVoting = false;
      status = MemberStatus.ACTIVE;
    } else {
      activityLevel = ActivityLevel.ACTIVE;
      shouldExcludeFromVoting = false;
      status = MemberStatus.ACTIVE;
    }

    return {
      userId: member.userId,
      roomId: member.roomId,
      status,
      lastActivityAt: lastActivity,
      minutesSinceActivity,
      activityLevel,
      shouldExcludeFromVoting,
    };
  }

  private async updateMemberActivityStatus(
    member: Member,
    newStatus: MemberStatus,
  ): Promise<void> {
    try {
      if (newStatus === MemberStatus.INACTIVE) {
        await this.memberService.markMemberInactive(
          member.roomId,
          member.userId,
        );
      } else {
        // Reactivar miembro
        await this.memberService.updateMemberActivity(
          member.roomId,
          member.userId,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error updating member activity status: ${error.message}`,
      );
      throw error;
    }
  }
}
