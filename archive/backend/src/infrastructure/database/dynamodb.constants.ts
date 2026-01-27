/**
 * Constantes para el diseño de tabla única de DynamoDB
 * Siguiendo el patrón Single Table Design para optimizar costos
 */

// Prefijos para Partition Keys (PK)
export const PK_PREFIXES = {
  USER: 'USER#',
  ROOM: 'ROOM#',
  MEDIA: 'MEDIA#',
  TEMPLATE: 'TEMPLATE#',
  THEME: 'THEME#',
  SCHEDULE: 'SCHEDULE#',
} as const;

// Prefijos para Sort Keys (SK)
export const SK_PREFIXES = {
  PROFILE: 'PROFILE',
  METADATA: 'METADATA',
  MEMBER: 'MEMBER#',
  VOTE: 'VOTE#',
  MATCH: 'MATCH#',
  TEMPLATE: 'TEMPLATE',
  SETTINGS: 'SETTINGS',
  THEME: 'THEME',
  SCHEDULE: 'SCHEDULE',
} as const;

// Prefijos para GSI1 (Global Secondary Index 1)
export const GSI1_PREFIXES = {
  USER_EMAIL: 'USER#',
  ROOM_CREATOR: 'ROOM#',
  MEDIA_GENRE: 'GENRE#',
  MEDIA_POPULARITY: 'POPULARITY#',
  VOTE_MEDIA: 'MEDIA#',
  MATCH_ROOM: 'MATCH#',
  TEMPLATE_CREATOR: 'TEMPLATE#',
  THEME_CREATOR: 'THEME#',
  SCHEDULE_ROOM: 'ROOM#',
} as const;

// Prefijos para GSI2 (Global Secondary Index 2)
export const GSI2_PREFIXES = {
  TEMPLATE_CATEGORY: 'CATEGORY#',
  TEMPLATE_USAGE: 'USAGE#',
  SETTINGS_USER: 'USER#',
  THEME_CATEGORY: 'CATEGORY#',
  THEME_USAGE: 'USAGE#',
  SCHEDULE_USER: 'USER#',
} as const;

// Nombres de índices
export const INDEXES = {
  GSI1: 'GSI1',
  GSI2: 'GSI2',
} as const;
/**
 * Funciones helper para generar keys consistentes
 */
export class DynamoDBKeys {
  // User keys
  static userPK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static userSK(): string {
    return SK_PREFIXES.PROFILE;
  }

  static userGSI1PK(email: string): string {
    return `${GSI1_PREFIXES.USER_EMAIL}${email}`;
  }

  // Room keys
  static roomPK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  static roomSK(): string {
    return SK_PREFIXES.METADATA;
  }

  static roomGSI1PK(creatorId: string): string {
    return `${GSI1_PREFIXES.ROOM_CREATOR}${creatorId}`;
  }

  static roomGSI1SK(timestamp: string): string {
    return `CREATED#${timestamp}`;
  }

  // Member keys
  static memberSK(userId: string): string {
    return `${SK_PREFIXES.MEMBER}${userId}`;
  }

  static memberGSI1PK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static memberGSI1SK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  // Media keys
  static mediaPK(tmdbId: string): string {
    return `${PK_PREFIXES.MEDIA}${tmdbId}`;
  }

  static mediaSK(): string {
    return SK_PREFIXES.METADATA;
  }

  static mediaGSI1PK(genre: string): string {
    return `${GSI1_PREFIXES.MEDIA_GENRE}${genre}`;
  }

  static mediaGSI1SK(popularity: number): string {
    // Padding para ordenamiento correcto
    const paddedPopularity = popularity.toString().padStart(10, '0');
    return `${GSI1_PREFIXES.MEDIA_POPULARITY}${paddedPopularity}`;
  }

  // Vote keys
  static voteSK(userId: string, mediaId: string): string {
    return `${SK_PREFIXES.VOTE}${userId}#${mediaId}`;
  }

  static voteGSI1PK(mediaId: string): string {
    return `${PK_PREFIXES.MEDIA}${mediaId}`;
  }

  static voteGSI1SK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  // Match keys
  static matchSK(mediaId: string): string {
    return `${SK_PREFIXES.MATCH}${mediaId}`;
  }

  static matchGSI1PK(roomId: string): string {
    return `${GSI1_PREFIXES.MATCH_ROOM}${roomId}`;
  }

  static matchGSI1SK(timestamp: string): string {
    return `CREATED#${timestamp}`;
  }

  // Template keys
  static templatePK(templateId: string): string {
    return `${PK_PREFIXES.TEMPLATE}${templateId}`;
  }

  static templateSK(): string {
    return SK_PREFIXES.TEMPLATE;
  }

  static templateGSI1PK(creatorId: string): string {
    return `${GSI1_PREFIXES.TEMPLATE_CREATOR}${creatorId}`;
  }

  static templateGSI1SK(timestamp: string): string {
    return `CREATED#${timestamp}`;
  }

  static templateGSI2PK(category: string): string {
    return `${GSI2_PREFIXES.TEMPLATE_CATEGORY}${category}`;
  }

  static templateGSI2SK(usageCount: number, templateId: string): string {
    // Padding para ordenamiento correcto (descendente por uso)
    const paddedUsage = (999999 - usageCount).toString().padStart(6, '0');
    return `${GSI2_PREFIXES.TEMPLATE_USAGE}${paddedUsage}#${templateId}`;
  }

  // Room Settings keys
  static roomSettingsPK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  static roomSettingsSK(): string {
    return SK_PREFIXES.SETTINGS;
  }

  static roomSettingsGSI1PK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static roomSettingsGSI1SK(timestamp: string): string {
    return `SETTINGS#${timestamp}`;
  }

  // Room Moderation keys
  static roomRolePK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  static roomRoleSK(roleId: string): string {
    return `ROLE#${roleId}`;
  }

  static memberRolePK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  static memberRoleSK(userId: string, roleId: string): string {
    return `MEMBER_ROLE#${userId}#${roleId}`;
  }

  static memberRoleGSI1PK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static memberRoleGSI1SK(roomId: string, roleId: string): string {
    return `ROOM_ROLE#${roomId}#${roleId}`;
  }

  static moderationActionPK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  static moderationActionSK(actionId: string): string {
    return `MODERATION#${actionId}`;
  }

  static moderationActionGSI1PK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static moderationActionGSI1SK(timestamp: string): string {
    return `MODERATION#${timestamp}`;
  }

  // Theme keys
  static themePK(themeId: string): string {
    return `${PK_PREFIXES.THEME}${themeId}`;
  }

  static themeSK(): string {
    return SK_PREFIXES.THEME;
  }

  static themeGSI1PK(creatorId: string): string {
    return `${GSI1_PREFIXES.THEME_CREATOR}${creatorId}`;
  }

  static themeGSI1SK(timestamp: string): string {
    return `CREATED#${timestamp}`;
  }

  static themeGSI2PK(category: string): string {
    return `${GSI2_PREFIXES.THEME_CATEGORY}${category}`;
  }

  static themeGSI2SK(usageCount: number, themeId: string): string {
    // Padding para ordenamiento correcto (descendente por uso)
    const paddedUsage = (999999 - usageCount).toString().padStart(6, '0');
    return `${GSI2_PREFIXES.THEME_USAGE}${paddedUsage}#${themeId}`;
  }

  // Room Theme Application keys
  static roomThemeApplicationPK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  static roomThemeApplicationSK(themeId: string): string {
    return `THEME_APP#${themeId}`;
  }

  static themeApplicationGSI1PK(themeId: string): string {
    return `${PK_PREFIXES.THEME}${themeId}`;
  }

  static themeApplicationGSI1SK(timestamp: string): string {
    return `APPLIED#${timestamp}`;
  }

  // Theme Rating keys
  static themeRatingPK(themeId: string): string {
    return `${PK_PREFIXES.THEME}${themeId}`;
  }

  static themeRatingSK(userId: string): string {
    return `RATING#${userId}`;
  }

  static themeRatingGSI1PK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static themeRatingGSI1SK(timestamp: string): string {
    return `RATING#${timestamp}`;
  }

  // Theme Change History keys
  static themeChangeHistoryPK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  static themeChangeHistorySK(changeId: string): string {
    return `THEME_CHANGE#${changeId}`;
  }

  static themeChangeHistoryGSI1PK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static themeChangeHistoryGSI1SK(timestamp: string): string {
    return `THEME_CHANGE#${timestamp}`;
  }

  // Schedule keys
  static schedulesPK(scheduleId: string): string {
    return `${PK_PREFIXES.SCHEDULE}${scheduleId}`;
  }

  static schedulesSK(): string {
    return SK_PREFIXES.SCHEDULE;
  }

  static schedulesGSI1PK(roomId: string): string {
    return `${GSI1_PREFIXES.SCHEDULE_ROOM}${roomId}`;
  }

  static schedulesGSI1SK(timestamp: string): string {
    return `SCHEDULED#${timestamp}`;
  }

  static schedulesGSI2PK(userId: string): string {
    return `${GSI2_PREFIXES.SCHEDULE_USER}${userId}`;
  }

  static schedulesGSI2SK(timestamp: string): string {
    return `SCHEDULED#${timestamp}`;
  }

  // Schedule Attendees keys
  static scheduleAttendeesPK(scheduleId: string): string {
    return `${PK_PREFIXES.SCHEDULE}${scheduleId}`;
  }

  static scheduleAttendeesSK(userId: string): string {
    return `ATTENDEE#${userId}`;
  }

  static scheduleAttendeesGSI1PK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static scheduleAttendeesGSI1SK(scheduleId: string): string {
    return `ATTENDING#${scheduleId}`;
  }

  // Schedule Instances keys
  static scheduleInstancesPK(scheduleId: string): string {
    return `${PK_PREFIXES.SCHEDULE}${scheduleId}`;
  }

  static scheduleInstancesSK(instanceId: string): string {
    return `INSTANCE#${instanceId}`;
  }

  static scheduleInstancesGSI1PK(date: string): string {
    return `DATE#${date}`;
  }

  static scheduleInstancesGSI1SK(timestamp: string): string {
    return `INSTANCE#${timestamp}`;
  }

  // Schedule Notifications keys
  static scheduleNotificationsPK(scheduleId: string): string {
    return `${PK_PREFIXES.SCHEDULE}${scheduleId}`;
  }

  static scheduleNotificationsSK(notificationId: string): string {
    return `NOTIFICATION#${notificationId}`;
  }

  static scheduleNotificationsGSI1PK(date: string): string {
    return `NOTIFICATION_DATE#${date}`;
  }

  static scheduleNotificationsGSI1SK(timestamp: string): string {
    return `SCHEDULED#${timestamp}`;
  }
}
