import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AutomationLevel,
  SmartRecommendation,
  OptimizationDecision,
  AutomationPerformanceMetrics,
} from '../../../domain/entities/room-automation.entity';
import type { RoomAutomationConfig } from '../../../domain/entities/room-automation.entity';

// Content Optimization DTOs
export class SmartInjectionDto {
  @ApiProperty({ description: 'Enable smart content injection' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    description: 'Injection frequency',
    enum: ['low', 'medium', 'high', 'adaptive'],
  })
  @IsEnum(['low', 'medium', 'high', 'adaptive'])
  frequency: 'low' | 'medium' | 'high' | 'adaptive';

  @ApiProperty({
    description: 'Weight for user preferences (0-1)',
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  preferenceWeight: number;

  @ApiProperty({
    description: 'Weight for content diversity (0-1)',
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  diversityWeight: number;

  @ApiProperty({ description: 'Enable timing optimization' })
  @IsBoolean()
  timingOptimization: boolean;
}

export class SmartCurationDto {
  @ApiProperty({ description: 'Enable smart content curation' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Remove consistently unliked content' })
  @IsBoolean()
  removeUnlikedContent: boolean;

  @ApiProperty({ description: 'Boost popular content' })
  @IsBoolean()
  boostPopularContent: boolean;

  @ApiProperty({ description: 'Adapt to mood using AI' })
  @IsBoolean()
  adaptToMood: boolean;
}

export class QueueOptimizationDto {
  @ApiProperty({ description: 'Enable queue optimization' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Reorder queue by preferences' })
  @IsBoolean()
  reorderByPreference: boolean;

  @ApiProperty({ description: 'Remove stale content' })
  @IsBoolean()
  removeStaleContent: boolean;

  @ApiPropertyOptional({ description: 'Maximum queue size' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(100)
  maxQueueSize?: number;
}

export class ContentOptimizationDto {
  @ApiProperty({ description: 'Enable content optimization' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Smart injection configuration' })
  @ValidateNested()
  @Type(() => SmartInjectionDto)
  smartInjection: SmartInjectionDto;

  @ApiProperty({ description: 'Smart curation configuration' })
  @ValidateNested()
  @Type(() => SmartCurationDto)
  smartCuration: SmartCurationDto;

  @ApiProperty({ description: 'Queue optimization configuration' })
  @ValidateNested()
  @Type(() => QueueOptimizationDto)
  queueOptimization: QueueOptimizationDto;
}

// Session Optimization DTOs
export class TimingOptimizationDto {
  @ApiProperty({ description: 'Enable timing optimization' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Suggest optimal session times' })
  @IsBoolean()
  suggestOptimalTimes: boolean;

  @ApiProperty({ description: 'Auto-schedule sessions' })
  @IsBoolean()
  autoSchedule: boolean;

  @ApiProperty({ description: 'Consider member availability' })
  @IsBoolean()
  considerMemberAvailability: boolean;
}

export class SessionManagementDto {
  @ApiProperty({ description: 'Enable session management' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Auto-pause on inactivity' })
  @IsBoolean()
  autoPauseOnInactivity: boolean;

  @ApiProperty({ description: 'Auto-resume on activity' })
  @IsBoolean()
  autoResumeOnActivity: boolean;

  @ApiProperty({
    description: 'Inactivity threshold in minutes',
    minimum: 5,
    maximum: 60,
  })
  @IsNumber()
  @Min(5)
  @Max(60)
  inactivityThresholdMinutes: number;

  @ApiProperty({ description: 'Suggest smart breaks' })
  @IsBoolean()
  smartBreaks: boolean;
}

export class DurationOptimizationDto {
  @ApiProperty({ description: 'Enable duration optimization' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Suggest optimal session duration' })
  @IsBoolean()
  suggestOptimalDuration: boolean;

  @ApiProperty({ description: 'Adapt based on engagement' })
  @IsBoolean()
  adaptBasedOnEngagement: boolean;

  @ApiPropertyOptional({ description: 'Maximum session duration in minutes' })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  maxSessionDuration?: number;
}

export class SessionOptimizationDto {
  @ApiProperty({ description: 'Enable session optimization' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Timing optimization configuration' })
  @ValidateNested()
  @Type(() => TimingOptimizationDto)
  timingOptimization: TimingOptimizationDto;

  @ApiProperty({ description: 'Session management configuration' })
  @ValidateNested()
  @Type(() => SessionManagementDto)
  sessionManagement: SessionManagementDto;

  @ApiProperty({ description: 'Duration optimization configuration' })
  @ValidateNested()
  @Type(() => DurationOptimizationDto)
  durationOptimization: DurationOptimizationDto;
}

// Member Engagement DTOs
export class EngagementTrackingDto {
  @ApiProperty({ description: 'Enable engagement tracking' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Track voting speed' })
  @IsBoolean()
  trackVotingSpeed: boolean;

  @ApiProperty({ description: 'Track participation rates' })
  @IsBoolean()
  trackParticipation: boolean;

  @ApiProperty({ description: 'Track chat activity' })
  @IsBoolean()
  trackChatActivity: boolean;
}

export class EngagementOptimizationDto {
  @ApiProperty({ description: 'Enable engagement optimization' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Encourage participation' })
  @IsBoolean()
  encourageParticipation: boolean;

  @ApiProperty({ description: 'Adapt to engagement level' })
  @IsBoolean()
  adaptToEngagementLevel: boolean;

  @ApiProperty({ description: 'Send personalized notifications' })
  @IsBoolean()
  personalizedNotifications: boolean;
}

export class InactiveMemberHandlingDto {
  @ApiProperty({ description: 'Enable inactive member handling' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Auto-exclude inactive members' })
  @IsBoolean()
  autoExcludeInactive: boolean;

  @ApiProperty({ description: 'Send re-engagement notifications' })
  @IsBoolean()
  sendReengagementNotifications: boolean;

  @ApiProperty({
    description: 'Grace period in minutes',
    minimum: 10,
    maximum: 120,
  })
  @IsNumber()
  @Min(10)
  @Max(120)
  gracePeriodMinutes: number;
}

export class MemberEngagementDto {
  @ApiProperty({ description: 'Enable member engagement optimization' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Engagement tracking configuration' })
  @ValidateNested()
  @Type(() => EngagementTrackingDto)
  engagementTracking: EngagementTrackingDto;

  @ApiProperty({ description: 'Engagement optimization configuration' })
  @ValidateNested()
  @Type(() => EngagementOptimizationDto)
  engagementOptimization: EngagementOptimizationDto;

  @ApiProperty({ description: 'Inactive member handling configuration' })
  @ValidateNested()
  @Type(() => InactiveMemberHandlingDto)
  inactiveMemberHandling: InactiveMemberHandlingDto;
}

// Preference Learning DTOs
export class LearningSettingsDto {
  @ApiProperty({ description: 'Enable preference learning' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Learning rate (0-1)', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  learningRate: number;

  @ApiProperty({
    description: 'Memory decay rate (0-1)',
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  memoryDecay: number;

  @ApiProperty({
    description: 'Confidence threshold (0-1)',
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceThreshold: number;
}

export class PreferenceSourcesDto {
  @ApiProperty({ description: 'Use voting history' })
  @IsBoolean()
  votingHistory: boolean;

  @ApiProperty({ description: 'Use chat sentiment analysis' })
  @IsBoolean()
  chatSentiment: boolean;

  @ApiProperty({ description: 'Use session behavior' })
  @IsBoolean()
  sessionBehavior: boolean;

  @ApiProperty({ description: 'Use explicit feedback' })
  @IsBoolean()
  explicitFeedback: boolean;
}

export class PreferenceApplicationDto {
  @ApiProperty({ description: 'Apply to content recommendations' })
  @IsBoolean()
  contentRecommendations: boolean;

  @ApiProperty({ description: 'Apply to injection timing' })
  @IsBoolean()
  injectionTiming: boolean;

  @ApiProperty({ description: 'Apply to session planning' })
  @IsBoolean()
  sessionPlanning: boolean;

  @ApiProperty({ description: 'Apply to member matching' })
  @IsBoolean()
  memberMatching: boolean;
}

export class PreferenceLearningDto {
  @ApiProperty({ description: 'Enable preference learning' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Learning settings configuration' })
  @ValidateNested()
  @Type(() => LearningSettingsDto)
  learningSettings: LearningSettingsDto;

  @ApiProperty({ description: 'Preference sources configuration' })
  @ValidateNested()
  @Type(() => PreferenceSourcesDto)
  preferenceSources: PreferenceSourcesDto;

  @ApiProperty({ description: 'Preference application configuration' })
  @ValidateNested()
  @Type(() => PreferenceApplicationDto)
  preferenceApplication: PreferenceApplicationDto;
}

// Main DTOs
export class CreateAutomationConfigDto {
  @ApiPropertyOptional({ description: 'Enable automation', default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Automation level',
    enum: AutomationLevel,
    default: AutomationLevel.BASIC,
  })
  @IsOptional()
  @IsEnum(AutomationLevel)
  automationLevel?: AutomationLevel;

  @ApiPropertyOptional({ description: 'Content optimization configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentOptimizationDto)
  contentOptimization?: ContentOptimizationDto;

  @ApiPropertyOptional({ description: 'Session optimization configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionOptimizationDto)
  sessionOptimization?: SessionOptimizationDto;

  @ApiPropertyOptional({ description: 'Member engagement configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MemberEngagementDto)
  memberEngagement?: MemberEngagementDto;

  @ApiPropertyOptional({ description: 'Preference learning configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferenceLearningDto)
  preferenceLearning?: PreferenceLearningDto;
}

export class UpdateAutomationConfigDto {
  @ApiPropertyOptional({ description: 'Enable/disable automation' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Automation level',
    enum: AutomationLevel,
  })
  @IsOptional()
  @IsEnum(AutomationLevel)
  automationLevel?: AutomationLevel;

  @ApiPropertyOptional({ description: 'Content optimization configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentOptimizationDto)
  contentOptimization?: ContentOptimizationDto;

  @ApiPropertyOptional({ description: 'Session optimization configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionOptimizationDto)
  sessionOptimization?: SessionOptimizationDto;

  @ApiPropertyOptional({ description: 'Member engagement configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MemberEngagementDto)
  memberEngagement?: MemberEngagementDto;

  @ApiPropertyOptional({ description: 'Preference learning configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferenceLearningDto)
  preferenceLearning?: PreferenceLearningDto;
}

export class AutomationFeedbackDto {
  @ApiProperty({ description: 'Type of automation being rated' })
  @IsString()
  automationType: string;

  @ApiProperty({ description: 'Rating from 1-5', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Optional comment' })
  @IsOptional()
  @IsString()
  comment?: string;
}

// Response DTOs
export class AutomationConfigResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Automation configuration data' })
  data: RoomAutomationConfig;
}

export class SmartRecommendationResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Recommendations data' })
  data: {
    roomId: string;
    recommendations: SmartRecommendation[];
    totalRecommendations: number;
    generatedAt: Date;
  };
}

export class OptimizationDecisionResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Optimization decisions data' })
  data: {
    roomId: string;
    decisions: OptimizationDecision[];
    optimizedAt: Date;
    totalDecisions: number;
    appliedDecisions: number;
  };
}

export class AutomationPerformanceResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Performance metrics data' })
  data: {
    roomId: string;
    metrics: AutomationPerformanceMetrics;
    retrievedAt: Date;
  };
}
