import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { v4 as uuidv4 } from 'uuid';

export interface PermissionAuditLog {
  id: string;
  userId: string;
  roomId?: string;
  endpoint: string;
  method: string;
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
  success: boolean;
  permissions?: string[];
  errorMessage?: string;
  responseTime?: number;
}

/**
 * Middleware para auditar accesos y verificaciones de permisos
 */
@Injectable()
export class PermissionAuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PermissionAuditMiddleware.name);

  constructor(private dynamoDBService: DynamoDBService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const auditId = uuidv4();

    // Capturar información de la request
    const originalSend = res.send;
    let responseBody: any;

    res.send = function (body) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    // Continuar con la request
    res.on('finish', async () => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Solo auditar endpoints relacionados con permisos
      if (this.shouldAudit(req.path)) {
        await this.logPermissionAccess({
          id: auditId,
          userId: (req.user as any)?.id || (req.user as any)?.sub || 'anonymous',
          roomId: req.params.roomId || req.body?.roomId,
          endpoint: req.path,
          method: req.method,
          timestamp: new Date(),
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip,
          success: res.statusCode < 400,
          errorMessage:
            res.statusCode >= 400
              ? this.extractErrorMessage(responseBody)
              : undefined,
          responseTime,
        });
      }
    });

    next();
  }

  private shouldAudit(path: string): boolean {
    const auditPaths = [
      '/rooms',
      '/room-moderation',
      '/room-themes',
      '/room-schedules',
      '/room-templates',
    ];

    return auditPaths.some((auditPath) => path.includes(auditPath));
  }

  private async logPermissionAccess(
    auditLog: PermissionAuditLog,
  ): Promise<void> {
    try {
      await this.dynamoDBService.putItem({
        PK: `AUDIT#${auditLog.userId}`,
        SK: `ACCESS#${auditLog.timestamp.toISOString()}#${auditLog.id}`,
        GSI1PK: `ROOM_AUDIT#${auditLog.roomId || 'GLOBAL'}`,
        GSI1SK: `ACCESS#${auditLog.timestamp.toISOString()}`,
        ...auditLog,
      });

      if (!auditLog.success) {
        this.logger.warn(
          `Acceso denegado auditado: ${auditLog.userId} -> ${auditLog.endpoint} (${auditLog.errorMessage})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error registrando auditoría de permisos: ${error.message}`,
      );
    }
  }

  private extractErrorMessage(responseBody: any): string {
    if (typeof responseBody === 'string') {
      try {
        const parsed = JSON.parse(responseBody);
        return parsed.message || parsed.error || 'Error desconocido';
      } catch {
        return responseBody;
      }
    }
    return responseBody?.message || responseBody?.error || 'Error desconocido';
  }
}
