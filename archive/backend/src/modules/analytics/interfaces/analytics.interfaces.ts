export interface AnalyticsEvent {
  eventId: string;
  eventType: EventType;
  timestamp: Date;
  userId?: string;
  roomId?: string;
  sessionId: string;
  properties: Record<string, any>;
  context: EventContext;
  processed?: boolean;
  ttl?: number;
}

export interface EventContext {
  userAgent?: string;
  ipAddress?: string;
  deviceType?: string;
  platform?: string;
  source?: string;
}

export enum EventType {
  // User Events
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_REGISTER = 'user_register',

  // Room Events
  ROOM_CREATED = 'room_created',
  ROOM_JOINED = 'room_joined',
  ROOM_LEFT = 'room_left',
  ROOM_STARTED = 'room_started',
  ROOM_PAUSED = 'room_paused',
  ROOM_COMPLETED = 'room_completed',

  // Interaction Events
  CONTENT_VOTED = 'content_voted',
  MATCH_FOUND = 'match_found',
  CONSENSUS_ACHIEVED = 'consensus_achieved',

  // Automation Events
  AUTOMATION_CREATED = 'automation_created',
  AUTOMATION_UPDATED = 'automation_updated',
  AUTOMATION_FEEDBACK = 'automation_feedback',

  // AI Events
  AI_RECOMMENDATION_REQUESTED = 'ai_recommendation_requested',
  AI_RECOMMENDATION_ACCEPTED = 'ai_recommendation_accepted',

  // Template Events
  TEMPLATE_CREATED = 'template_created',
  TEMPLATE_USED = 'template_used',
  TEMPLATE_RATED = 'template_rated',

  // Theme Events
  THEME_CREATED = 'theme_created',
  THEME_APPLIED = 'theme_applied',
  THEME_RATED = 'theme_rated',
  THEME_REMOVED = 'theme_removed',

  // Schedule Events
  SCHEDULE_CREATED = 'schedule_created',
  SCHEDULE_UPDATED = 'schedule_updated',
  SCHEDULE_ATTENDED = 'schedule_attended',
  SCHEDULE_MISSED = 'schedule_missed',
  SCHEDULE_CANCELLED = 'schedule_cancelled',

  // Moderation Events
  ROLE_CREATED = 'role_created',
  ROLE_ASSIGNED = 'role_assigned',
  MODERATION_ACTION = 'moderation_action',
  PERMISSION_CHECKED = 'permission_checked',

  // Advanced Settings Events
  SETTINGS_UPDATED = 'settings_updated',
  SETTINGS_RESET = 'settings_reset',

  // System Events
  API_REQUEST = 'api_request',
  ERROR_OCCURRED = 'error_occurred',
  PERFORMANCE_METRIC = 'performance_metric',
}

export interface UserMetrics {
  userId: string;
  date: string;
  sessionCount: number;
  totalSessionDuration: number;
  actionsPerformed: number;
  roomsJoined: number;
  votesSubmitted: number;
  matchesFound: number;
  aiRecommendationsRequested: number;
  lastActiveAt: Date;
  deviceTypes: string[];
  preferredGenres: string[];
}

export interface RoomMetrics {
  roomId: string;
  date: string;
  memberCount: number;
  totalVotes: number;
  matchesFound: number;
  consensusRate: number;
  averageTimeToConsensus: number;
  dropoutRate: number;
  contentCategories: Record<string, number>;
  memberSatisfactionScore: number;
  aiRecommendationUsage: number;
}

export interface ContentMetrics {
  contentId: string;
  date: string;
  totalViews: number;
  totalVotes: number;
  positiveVotes: number;
  negativeVotes: number;
  matchCount: number;
  averageRating: number;
  genreCategory: string;
  releaseYear: number;
  aiRecommendationSource: boolean;
  demographicBreakdown: Record<string, number>;
}

export interface SystemMetrics {
  metricType: string;
  timestamp: Date;
  value: number;
  unit: string;
  tags: Record<string, string>;
  threshold?: number;
  alertLevel?: 'info' | 'warning' | 'critical';
}

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface DashboardOverview {
  activeUsers: {
    current: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
  roomMetrics: {
    activeRooms: number;
    totalRoomsToday: number;
    averageConsensusRate: number;
    averageRoomDuration: number;
  };
  contentMetrics: {
    totalVotesToday: number;
    matchesFoundToday: number;
    topGenres: Array<{ genre: string; count: number }>;
  };
  systemHealth: {
    apiResponseTime: number;
    errorRate: number;
    uptime: number;
  };
}

export interface UserBehaviorAnalytics {
  totalUsers: number;
  activeUsers: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  sessionMetrics: {
    averageDuration: number;
    actionsPerSession: number;
    bounceRate: number;
  };
  engagementMetrics: {
    votesPerUser: number;
    roomsJoinedPerUser: number;
    matchesFoundPerUser: number;
  };
  retentionMetrics: {
    day1: number;
    day7: number;
    day30: number;
  };
}

export interface RoomPerformanceAnalytics {
  totalRooms: number;
  completionRate: number;
  averageMetrics: {
    duration: number;
    memberCount: number;
    votesPerMatch: number;
    timeToConsensus: number;
  };
  performanceDistribution: {
    highPerforming: number;
    mediumPerforming: number;
    lowPerforming: number;
  };
  optimizationInsights: Array<{
    insight: string;
    impact: 'high' | 'medium' | 'low';
    recommendation: string;
  }>;
}

export interface ContentPreferenceAnalytics {
  genrePreferences: Record<string, number>;
  contentPerformance: {
    topRated: Array<{ contentId: string; rating: number }>;
    mostVoted: Array<{ contentId: string; votes: number }>;
    highestConsensus: Array<{ contentId: string; consensusRate: number }>;
  };
  aiRecommendationMetrics: {
    totalRecommendations: number;
    acceptanceRate: number;
    effectivenessScore: number;
  };
  trendingContent: Array<{
    contentId: string;
    trendScore: number;
    category: string;
  }>;
}

export interface PredictiveInsights {
  userChurnPrediction: Array<{
    userId: string;
    churnProbability: number;
    riskFactors: string[];
    recommendations: string[];
  }>;
  roomSuccessPrediction: Array<{
    roomId: string;
    successProbability: number;
    optimizationSuggestions: string[];
  }>;
  contentTrends: Array<{
    genre: string;
    trendDirection: 'up' | 'down' | 'stable';
    confidence: number;
    timeframe: string;
  }>;
}

export interface AnalyticsAlert {
  alertId: string;
  type: 'performance' | 'usage' | 'error' | 'business';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
  metadata: Record<string, any>;
}

export interface ExportRequest {
  dataType: 'events' | 'metrics' | 'insights';
  format: 'json' | 'csv' | 'parquet';
  timeRange: TimeRange;
  filters?: Record<string, any>;
  includePersonalData?: boolean;
}

export interface ExportResponse {
  exportId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: Date;
  recordCount?: number;
  fileSizeBytes?: number;
}

// Advanced Room Features Analytics Interfaces

export interface AdvancedRoomAnalytics {
  templateAnalytics: TemplateAnalytics;
  themeAnalytics: ThemeAnalytics;
  scheduleAnalytics: ScheduleAnalytics;
  moderationAnalytics: ModerationAnalytics;
  settingsAnalytics: SettingsAnalytics;
  memberEngagementAnalytics: MemberEngagementAnalytics;
  roomPerformanceScoring: RoomPerformanceScoring;
}

export interface TemplateAnalytics {
  totalTemplates: number;
  publicTemplates: number;
  privateTemplates: number;
  templateUsageStats: {
    totalUsages: number;
    averageUsagesPerTemplate: number;
    mostUsedTemplates: Array<{
      templateId: string;
      name: string;
      usageCount: number;
      successRate: number;
    }>;
  };
  templateCategoryDistribution: Record<string, number>;
  templateEffectiveness: {
    averageRoomSuccessRate: number;
    templatedVsNonTemplatedRooms: {
      templated: { successRate: number; averageDuration: number };
      nonTemplated: { successRate: number; averageDuration: number };
    };
  };
  templateCreationTrends: Array<{
    date: string;
    templatesCreated: number;
    templatesUsed: number;
  }>;
}

export interface ThemeAnalytics {
  totalThemes: number;
  systemThemes: number;
  customThemes: number;
  themeUsageStats: {
    totalApplications: number;
    averageApplicationsPerTheme: number;
    mostPopularThemes: Array<{
      themeId: string;
      name: string;
      applicationCount: number;
      averageRating: number;
    }>;
  };
  themeCategoryDistribution: Record<string, number>;
  themeImpactOnEngagement: {
    themedRooms: { engagementScore: number; retentionRate: number };
    nonThemedRooms: { engagementScore: number; retentionRate: number };
  };
  themeRatingDistribution: Record<number, number>; // rating -> count
}

export interface ScheduleAnalytics {
  totalSchedules: number;
  activeSchedules: number;
  recurringSchedules: number;
  scheduleAttendanceStats: {
    averageAttendanceRate: number;
    totalScheduledSessions: number;
    completedSessions: number;
    cancelledSessions: number;
  };
  recurrencePatternDistribution: Record<string, number>;
  scheduleEffectiveness: {
    scheduledVsAdHocRooms: {
      scheduled: { attendanceRate: number; completionRate: number };
      adHoc: { attendanceRate: number; completionRate: number };
    };
  };
  timeSlotAnalytics: Array<{
    hour: number;
    dayOfWeek: number;
    scheduleCount: number;
    averageAttendance: number;
  }>;
  notificationEffectiveness: {
    emailNotifications: { sentCount: number; openRate: number };
    pushNotifications: { sentCount: number; clickRate: number };
  };
}

export interface ModerationAnalytics {
  totalCustomRoles: number;
  averageRolesPerRoom: number;
  roleUsageDistribution: Record<string, number>;
  moderationActionStats: {
    totalActions: number;
    actionTypeDistribution: Record<string, number>;
    averageActionsPerRoom: number;
  };
  permissionCheckStats: {
    totalChecks: number;
    deniedChecks: number;
    denialRate: number;
    mostCheckedPermissions: Array<{
      permission: string;
      checkCount: number;
      denialRate: number;
    }>;
  };
  moderationEffectiveness: {
    roomsWithModeration: { incidentRate: number; memberSatisfaction: number };
    roomsWithoutModeration: {
      incidentRate: number;
      memberSatisfaction: number;
    };
  };
}

export interface SettingsAnalytics {
  settingsUsageStats: {
    roomsWithAdvancedSettings: number;
    mostModifiedSettings: Array<{
      settingName: string;
      modificationCount: number;
      averageValue: any;
    }>;
  };
  settingsImpactOnPerformance: {
    consensusThresholdAnalysis: Array<{
      threshold: number;
      roomCount: number;
      averageConsensusTime: number;
      successRate: number;
    }>;
    privacySettingsImpact: {
      publicRooms: { joinRate: number; completionRate: number };
      privateRooms: { joinRate: number; completionRate: number };
    };
  };
  recommendationAcceptanceRate: number;
}

export interface MemberEngagementAnalytics {
  engagementScoreDistribution: Record<string, number>; // score range -> count
  engagementFactors: {
    templateUsage: { impact: number; correlation: number };
    themeCustomization: { impact: number; correlation: number };
    scheduleParticipation: { impact: number; correlation: number };
    roleParticipation: { impact: number; correlation: number };
  };
  memberRetentionByFeatureUsage: {
    templateUsers: { day7: number; day30: number };
    themeUsers: { day7: number; day30: number };
    scheduleUsers: { day7: number; day30: number };
    moderationUsers: { day7: number; day30: number };
  };
  featureAdoptionFunnel: {
    basicRoomCreation: number;
    templateUsage: number;
    themeApplication: number;
    scheduleCreation: number;
    advancedModeration: number;
  };
}

export interface RoomPerformanceScoring {
  overallScore: number;
  scoreComponents: {
    memberEngagement: number;
    consensusEfficiency: number;
    featureUtilization: number;
    memberSatisfaction: number;
    technicalPerformance: number;
  };
  scoreDistribution: Record<string, number>; // score range -> room count
  topPerformingRooms: Array<{
    roomId: string;
    score: number;
    keySuccessFactors: string[];
  }>;
  improvementRecommendations: Array<{
    category: string;
    recommendation: string;
    potentialImpact: number;
    implementationDifficulty: 'low' | 'medium' | 'high';
  }>;
}

export interface AdvancedAnalyticsMetrics {
  templateMetrics: TemplateMetrics;
  themeMetrics: ThemeMetrics;
  scheduleMetrics: ScheduleMetrics;
  moderationMetrics: ModerationMetrics;
  settingsMetrics: SettingsMetrics;
}

export interface TemplateMetrics {
  templateId: string;
  date: string;
  usageCount: number;
  successfulRooms: number;
  averageRoomDuration: number;
  averageMemberCount: number;
  consensusRate: number;
  memberSatisfactionScore: number;
  categoryTag: string;
  creatorId: string;
}

export interface ThemeMetrics {
  themeId: string;
  date: string;
  applicationCount: number;
  averageRating: number;
  engagementImpact: number;
  retentionImpact: number;
  categoryTag: string;
  creatorId?: string;
}

export interface ScheduleMetrics {
  scheduleId: string;
  date: string;
  attendanceRate: number;
  completionRate: number;
  notificationsSent: number;
  notificationOpenRate: number;
  recurrenceType: string;
  roomId: string;
  creatorId: string;
}

export interface ModerationMetrics {
  roomId: string;
  date: string;
  customRoleCount: number;
  moderationActionCount: number;
  permissionCheckCount: number;
  permissionDenialCount: number;
  memberSatisfactionScore: number;
  incidentCount: number;
}

export interface SettingsMetrics {
  roomId: string;
  date: string;
  advancedSettingsUsed: string[];
  consensusThreshold: number;
  privacyLevel: string;
  timeToConsensus: number;
  memberDropoutRate: number;
  settingsChangeCount: number;
}
