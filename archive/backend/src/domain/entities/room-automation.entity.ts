/**
 * Room Automation Entity
 * Defines the structure for smart room automation configurations and data
 */

export interface RoomAutomationConfig {
  id: string;
  roomId: string;
  creatorId: string;

  // Automation Settings
  isEnabled: boolean;
  automationLevel: AutomationLevel;

  // Content Optimization
  contentOptimization: ContentOptimizationConfig;

  // Session Optimization
  sessionOptimization: SessionOptimizationConfig;

  // Member Engagement
  memberEngagement: MemberEngagementConfig;

  // Preference Learning
  preferenceLearning: PreferenceLearningConfig;

  // Performance Metrics
  performanceMetrics: AutomationPerformanceMetrics;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastOptimizedAt?: Date;
}

export enum AutomationLevel {
  BASIC = 'basic', // Simple optimizations
  INTERMEDIATE = 'intermediate', // Moderate automation
  ADVANCED = 'advanced', // Full automation
  CUSTOM = 'custom', // User-defined rules
}

export interface ContentOptimizationConfig {
  enabled: boolean;

  // Injection Optimization
  smartInjection: {
    enabled: boolean;
    frequency: 'low' | 'medium' | 'high' | 'adaptive';
    preferenceWeight: number; // 0-1, how much to weight user preferences
    diversityWeight: number; // 0-1, how much to weight content diversity
    timingOptimization: boolean; // Optimize injection timing
  };

  // Content Curation
  smartCuration: {
    enabled: boolean;
    removeUnlikedContent: boolean;
    boostPopularContent: boolean;
    adaptToMood: boolean; // Use AI mood detection
  };

  // Queue Management
  queueOptimization: {
    enabled: boolean;
    reorderByPreference: boolean;
    removeStaleContent: boolean;
    maxQueueSize?: number;
  };
}

export interface SessionOptimizationConfig {
  enabled: boolean;

  // Timing Optimization
  timingOptimization: {
    enabled: boolean;
    suggestOptimalTimes: boolean;
    autoSchedule: boolean;
    considerMemberAvailability: boolean;
  };

  // Session Management
  sessionManagement: {
    enabled: boolean;
    autoPauseOnInactivity: boolean;
    autoResumeOnActivity: boolean;
    inactivityThresholdMinutes: number;
    smartBreaks: boolean; // Suggest breaks based on engagement
  };

  // Duration Optimization
  durationOptimization: {
    enabled: boolean;
    suggestOptimalDuration: boolean;
    adaptBasedOnEngagement: boolean;
    maxSessionDuration?: number;
  };
}

export interface MemberEngagementConfig {
  enabled: boolean;

  // Engagement Tracking
  engagementTracking: {
    enabled: boolean;
    trackVotingSpeed: boolean;
    trackParticipation: boolean;
    trackChatActivity: boolean;
  };

  // Engagement Optimization
  engagementOptimization: {
    enabled: boolean;
    encourageParticipation: boolean;
    adaptToEngagementLevel: boolean;
    personalizedNotifications: boolean;
  };

  // Inactive Member Handling
  inactiveMemberHandling: {
    enabled: boolean;
    autoExcludeInactive: boolean;
    sendReengagementNotifications: boolean;
    gracePeriodMinutes: number;
  };
}

export interface PreferenceLearningConfig {
  enabled: boolean;

  // Learning Settings
  learningSettings: {
    enabled: boolean;
    learningRate: number; // 0-1, how quickly to adapt
    memoryDecay: number; // 0-1, how quickly old preferences fade
    confidenceThreshold: number; // 0-1, minimum confidence for decisions
  };

  // Preference Sources
  preferenceSources: {
    votingHistory: boolean;
    chatSentiment: boolean;
    sessionBehavior: boolean;
    explicitFeedback: boolean;
  };

  // Application
  preferenceApplication: {
    contentRecommendations: boolean;
    injectionTiming: boolean;
    sessionPlanning: boolean;
    memberMatching: boolean;
  };
}

export interface AutomationPerformanceMetrics {
  // Effectiveness Metrics
  matchRateImprovement: number; // % improvement in match rate
  engagementImprovement: number; // % improvement in engagement
  sessionDurationOptimization: number; // % improvement in session duration
  memberRetentionImprovement: number; // % improvement in member retention

  // Automation Statistics
  totalOptimizations: number;
  successfulOptimizations: number;
  failedOptimizations: number;
  lastOptimizationScore: number; // 0-1, success score of last optimization

  // Learning Progress
  preferenceLearningAccuracy: number; // 0-1, accuracy of preference predictions
  automationConfidence: number; // 0-1, confidence in automation decisions

  // Performance Impact
  averageResponseTime: number; // ms, impact on system performance
  resourceUsage: number; // 0-1, relative resource usage

  // User Satisfaction
  userSatisfactionScore?: number; // 0-5, user rating of automation
  automationFeedback: AutomationFeedback[];
}

export interface AutomationFeedback {
  id: string;
  userId: string;
  roomId: string;
  automationType: AutomationType;
  rating: number; // 1-5
  comment?: string;
  timestamp: Date;
}

export enum AutomationType {
  CONTENT_INJECTION = 'content_injection',
  SESSION_TIMING = 'session_timing',
  MEMBER_ENGAGEMENT = 'member_engagement',
  PREFERENCE_LEARNING = 'preference_learning',
  QUEUE_OPTIMIZATION = 'queue_optimization',
  GENERAL = 'general',
}

// Optimization Decision Types
export interface OptimizationDecision {
  id: string;
  roomId: string;
  type: OptimizationType;
  decision: any; // Specific to optimization type
  confidence: number; // 0-1
  reasoning: string;
  expectedImpact: number; // 0-1
  timestamp: Date;
  applied: boolean;
  result?: OptimizationResult;
}

export enum OptimizationType {
  CONTENT_INJECTION = 'content_injection',
  CONTENT_REMOVAL = 'content_removal',
  QUEUE_REORDER = 'queue_reorder',
  SESSION_PAUSE = 'session_pause',
  SESSION_RESUME = 'session_resume',
  MEMBER_NOTIFICATION = 'member_notification',
  PREFERENCE_UPDATE = 'preference_update',
}

export interface OptimizationResult {
  success: boolean;
  actualImpact: number; // 0-1, measured impact
  metrics: {
    beforeMetrics: any;
    afterMetrics: any;
  };
  userFeedback?: number; // 1-5 rating
  timestamp: Date;
}

// Smart Recommendations
export interface SmartRecommendation {
  id: string;
  roomId: string;
  type: RecommendationType;
  title: string;
  description: string;
  confidence: number; // 0-1
  priority: RecommendationPriority;
  expectedBenefit: string;
  actionRequired: boolean;
  autoApplicable: boolean;
  expiresAt?: Date;
  createdAt: Date;
}

export enum RecommendationType {
  CONTENT_STRATEGY = 'content_strategy',
  SESSION_TIMING = 'session_timing',
  MEMBER_MANAGEMENT = 'member_management',
  ENGAGEMENT_BOOST = 'engagement_boost',
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',
}

export enum RecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Automation Learning Data
export interface AutomationLearningData {
  roomId: string;

  // Historical Performance
  historicalMetrics: {
    matchRates: number[];
    engagementLevels: number[];
    sessionDurations: number[];
    memberRetention: number[];
    timestamps: Date[];
  };

  // Member Behavior Patterns
  memberPatterns: {
    [userId: string]: MemberBehaviorPattern;
  };

  // Content Performance
  contentPerformance: {
    [contentId: string]: ContentPerformanceData;
  };

  // Session Patterns
  sessionPatterns: SessionPattern[];

  // Optimization History
  optimizationHistory: OptimizationDecision[];
}

export interface MemberBehaviorPattern {
  userId: string;

  // Voting Patterns
  votingSpeed: number; // Average seconds per vote
  votingConsistency: number; // 0-1, consistency in voting patterns
  preferenceStability: number; // 0-1, how stable preferences are

  // Engagement Patterns
  sessionParticipation: number; // 0-1, participation rate
  chatActivity: number; // Messages per session
  responseTime: number; // Average response time to notifications

  // Temporal Patterns
  activeHours: number[]; // Hours of day when most active (0-23)
  activeDays: number[]; // Days of week when most active (0-6)
  sessionDuration: number; // Average session duration

  // Preferences
  genrePreferences: { [genre: string]: number }; // 0-1 preference scores
  contentTypePreferences: { [type: string]: number };

  // Learning Metadata
  dataPoints: number; // Number of data points collected
  confidence: number; // 0-1, confidence in pattern accuracy
  lastUpdated: Date;
}

export interface ContentPerformanceData {
  contentId: string;

  // Performance Metrics
  matchRate: number; // 0-1, rate of matches for this content
  engagementScore: number; // 0-1, engagement when this content appears
  votingSpeed: number; // Average voting speed for this content

  // Context Data
  injectionTiming: number[]; // Minutes into session when injected
  roomTypes: string[]; // Types of rooms where it performed well
  memberProfiles: string[]; // Types of members who liked it

  // Metadata
  totalAppearances: number;
  totalVotes: number;
  lastSeen: Date;
}

export interface SessionPattern {
  id: string;
  roomId: string;

  // Session Characteristics
  duration: number; // Minutes
  memberCount: number;
  matchCount: number;
  engagementLevel: number; // 0-1

  // Timing
  startTime: Date;
  dayOfWeek: number; // 0-6
  hourOfDay: number; // 0-23

  // Performance
  successScore: number; // 0-1, overall session success
  memberSatisfaction: number; // 0-1, average member satisfaction

  // Context
  roomSettings: any; // Room settings at time of session
  memberProfiles: string[]; // Member types in session
  contentTypes: string[]; // Types of content in session
}
