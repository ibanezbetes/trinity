import { SetMetadata } from '@nestjs/common';
import { RoomPermission } from '../../domain/entities/room-moderation.entity';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorador para especificar permisos requeridos en un endpoint
 * @param permissions Lista de permisos requeridos
 */
export const RequirePermissions = (...permissions: RoomPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Decorador para endpoints que requieren ser propietario de la sala
 */
export const RequireOwner = () =>
  RequirePermissions(RoomPermission.DELETE_ROOM);

/**
 * Decorador para endpoints que requieren permisos de administrador
 */
export const RequireAdmin = () =>
  RequirePermissions(
    RoomPermission.MANAGE_ROLES,
    RoomPermission.MODIFY_SETTINGS,
    RoomPermission.REMOVE_MEMBERS,
  );

/**
 * Decorador para endpoints que requieren permisos de moderador
 */
export const RequireModerator = () =>
  RequirePermissions(
    RoomPermission.MUTE_MEMBERS,
    RoomPermission.WARN_MEMBERS,
    RoomPermission.VIEW_MODERATION_LOG,
  );

/**
 * Decorador para endpoints que requieren ser miembro de la sala
 */
export const RequireMember = () => RequirePermissions(RoomPermission.VIEW_ROOM);
