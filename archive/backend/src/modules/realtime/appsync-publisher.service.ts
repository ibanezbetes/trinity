import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Import AWS SDK v3 for AppSync
import {
  AppSyncClient,
  EvaluateMappingTemplateCommand,
  GetGraphqlApiCommand,
} from '@aws-sdk/client-appsync';

// Import GraphQL client for mutations
import { GraphQLClient } from 'graphql-request';

// Import interfaces from the original RealtimeService
import {
  VoteNotification,
  MatchNotification,
  RoomStateNotification,
  MemberStatusNotification,
  RoleAssignmentNotification,
  ModerationActionNotification,
  ScheduleNotification,
  ThemeChangeNotification,
  RoomSettingsNotification,
  ChatMessageNotification,
  ContentSuggestionNotification,
} from './realtime.service';

interface AppSyncConfig {
  apiUrl: string;
  apiKey?: string;
  region: string;
}

@Injectable()
export class AppSyncPublisher {
  private readonly logger = new Logger(AppSyncPublisher.name);
  private graphqlClient: GraphQLClient | null;
  private appSyncClient: AppSyncClient | null;
  private config: AppSyncConfig;

  constructor(private configService: ConfigService) {
    this.config = {
      apiUrl: this.configService.get<string>('APPSYNC_API_URL') || '',
      apiKey: this.configService.get<string>('APPSYNC_API_KEY'),
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
    };

    // Validate URL format before initializing GraphQL client
    const isValidUrl = this.isValidHttpsUrl(this.config.apiUrl);
    
    // Only initialize GraphQL client if AppSync is properly configured with valid URL
    if (this.config.apiUrl && this.config.apiKey && isValidUrl) {
      try {
        this.graphqlClient = new GraphQLClient(this.config.apiUrl, {
          headers: {
            'x-api-key': this.config.apiKey,
            'Content-Type': 'application/json',
          },
        });

        // Initialize AppSync client
        this.appSyncClient = new AppSyncClient({
          region: this.config.region,
        });

        this.logger.log(
          `🚀 AppSync Publisher initialized with API: ${this.config.apiUrl}`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Failed to initialize AppSync client: ${error.message}`,
        );
        this.graphqlClient = null;
        this.appSyncClient = null;
      }
    } else if (!isValidUrl && this.config.apiUrl) {
      this.logger.error(
        `❌ Invalid AppSync URL format: ${this.config.apiUrl}`,
      );
    } else {
      this.logger.warn(
        `⚠️ AppSync not configured. Add APPSYNC_API_URL and APPSYNC_API_KEY to enable real-time notifications.`,
      );
    }
  }

  /**
   * Validate if URL is a proper HTTPS URL
   */
  private isValidHttpsUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      return url.protocol === 'https:' && url.hostname.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Execute GraphQL mutation with error handling
   */
  private async executeMutation(
    mutation: string,
    variables: any,
  ): Promise<any> {
    try {
      // Check if AppSync is properly configured
      if (!this.config.apiUrl || !this.config.apiKey || !this.graphqlClient) {
        this.logger.debug('AppSync not configured, skipping mutation');
        return null;
      }
      
      return await this.graphqlClient.request(mutation, variables);
    } catch (error) {
      this.logger.error(`GraphQL mutation failed: ${error.message}`);
      // Don't throw - just log and continue
      return null;
    }
  }

  /**
   * Publish vote update event
   */
  async publishVoteUpdate(
    roomId: string,
    voteData: VoteNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `🗳️ Publishing vote update to room ${roomId}: ${voteData.userId} voted ${voteData.voteType} on ${voteData.mediaId}`,
      );

      const mutation = `
        mutation PublishVoteEvent($roomId: ID!, $voteData: AWSJSON!) {
          publishVoteEvent(roomId: $roomId, voteData: $voteData) {
            id
            timestamp
            roomId
            eventType
            userId
            mediaId
            voteType
          }
        }
      `;

      const variables = {
        roomId,
        voteData: JSON.stringify({
          userId: voteData.userId,
          mediaId: voteData.mediaId,
          voteType: voteData.voteType.toUpperCase(),
          progress: voteData.progress,
        }),
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Vote update published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish vote update: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish match found event
   */
  async publishMatchFound(
    roomId: string,
    matchData: MatchNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `🎯 Publishing match found to room ${roomId}: ${matchData.mediaTitle}`,
      );

      const mutation = `
        mutation PublishMatchEvent($roomId: ID!, $matchData: AWSJSON!) {
          publishMatchEvent(roomId: $roomId, matchData: $matchData) {
            id
            timestamp
            roomId
            eventType
            matchId
            mediaId
            mediaTitle
            participants
            consensusType
          }
        }
      `;

      const variables = {
        roomId,
        matchData: JSON.stringify({
          matchId: this.generateEventId(),
          mediaId: matchData.mediaId,
          mediaTitle: matchData.mediaTitle,
          participants: matchData.participants,
          consensusType: matchData.matchType.toUpperCase(),
        }),
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Match found published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish match found: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish room state change event
   */
  async publishRoomStateChange(
    roomId: string,
    stateData: RoomStateNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `🏠 Publishing room state change for ${roomId}: ${stateData.status}`,
      );

      const mutation = `
        mutation PublishRoomEvent($roomId: ID!, $eventType: String!, $data: AWSJSON!) {
          publishRoomEvent(roomId: $roomId, eventType: $eventType, data: $data) {
            id
            timestamp
            roomId
            eventType
            data
          }
        }
      `;

      const variables = {
        roomId,
        eventType: 'ROOM_STATE_CHANGE',
        data: JSON.stringify({
          status: stateData.status,
          currentMediaId: stateData.currentMediaId,
          queueLength: stateData.queueLength,
          activeMembers: stateData.activeMembers,
        }),
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Room state change published successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to publish room state change: ${error.message}`,
      );
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish member status change event
   */
  async publishMemberStatusChange(
    roomId: string,
    memberData: MemberStatusNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `👤 Publishing member status change for room ${roomId}: ${memberData.userId} is ${memberData.status}`,
      );

      const mutation = `
        mutation PublishMemberEvent($roomId: ID!, $memberData: AWSJSON!) {
          publishMemberEvent(roomId: $roomId, memberData: $memberData) {
            id
            timestamp
            roomId
            eventType
            userId
            action
            memberCount
          }
        }
      `;

      const variables = {
        roomId,
        memberData: {
          userId: memberData.userId,
          action: memberData.status === 'left' ? 'LEFT' : 'STATUS_CHANGED',
          memberCount: 0, // This should be calculated by the calling service
          memberData: {
            status: memberData.status,
            lastActivity: memberData.lastActivity,
          },
        },
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Member status change published successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to publish member status change: ${error.message}`,
      );
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish role assignment event
   */
  async publishRoleAssignment(
    roomId: string,
    roleData: RoleAssignmentNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `👑 Publishing role assignment for room ${roomId}: ${roleData.action} role ${roleData.roleName} to ${roleData.targetUserId}`,
      );

      const mutation = `
        mutation PublishRoleEvent($roomId: ID!, $roleData: AWSJSON!) {
          publishRoleEvent(roomId: $roomId, roleData: $roleData) {
            id
            timestamp
            roomId
            eventType
            targetUserId
            roleId
            roleName
            assignedBy
            action
          }
        }
      `;

      const variables = {
        roomId,
        roleData: {
          targetUserId: roleData.targetUserId,
          roleId: roleData.roleId,
          roleName: roleData.roleName,
          assignedBy: roleData.assignedBy,
          action: roleData.action.toUpperCase(),
        },
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Role assignment published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish role assignment: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish moderation action event
   */
  async publishModerationAction(
    roomId: string,
    moderationData: ModerationActionNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `🛡️ Publishing moderation action for room ${roomId}: ${moderationData.actionType} on ${moderationData.targetUserId}`,
      );

      const mutation = `
        mutation PublishModerationEvent($roomId: ID!, $moderationData: AWSJSON!) {
          publishModerationEvent(roomId: $roomId, moderationData: $moderationData) {
            id
            timestamp
            roomId
            eventType
            targetUserId
            moderatorId
            actionType
            reason
            duration
            expiresAt
          }
        }
      `;

      const variables = {
        roomId,
        moderationData: {
          targetUserId: moderationData.targetUserId,
          moderatorId: moderationData.moderatorId,
          actionType: moderationData.actionType,
          reason: moderationData.reason,
          duration: moderationData.duration,
          expiresAt: moderationData.expiresAt,
        },
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Moderation action published successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to publish moderation action: ${error.message}`,
      );
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish schedule event
   */
  async publishScheduleEvent(
    roomId: string,
    scheduleData: ScheduleNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `📅 Publishing schedule event for room ${roomId}: ${scheduleData.action} - ${scheduleData.title}`,
      );

      const mutation = `
        mutation PublishScheduleEvent($roomId: ID!, $scheduleData: AWSJSON!) {
          publishScheduleEvent(roomId: $roomId, scheduleData: $scheduleData) {
            id
            timestamp
            roomId
            eventType
            scheduleId
            title
            action
            startTime
            endTime
            message
          }
        }
      `;

      const variables = {
        roomId,
        scheduleData: {
          scheduleId: scheduleData.scheduleId,
          title: scheduleData.title,
          action: scheduleData.action.toUpperCase(),
          startTime: scheduleData.startTime,
          endTime: scheduleData.endTime,
          message: scheduleData.message,
        },
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Schedule event published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish schedule event: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish theme change event
   */
  async publishThemeChange(
    roomId: string,
    themeData: ThemeChangeNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `🎨 Publishing theme change for room ${roomId}: ${themeData.action} - ${themeData.themeName || 'theme'}`,
      );

      const mutation = `
        mutation PublishThemeEvent($roomId: ID!, $themeData: AWSJSON!) {
          publishThemeEvent(roomId: $roomId, themeData: $themeData) {
            id
            timestamp
            roomId
            eventType
            themeId
            themeName
            action
            appliedBy
            customizations
          }
        }
      `;

      const variables = {
        roomId,
        themeData: {
          themeId: themeData.themeId,
          themeName: themeData.themeName,
          action: themeData.action.toUpperCase(),
          appliedBy: themeData.appliedBy,
          customizations: themeData.customizations,
        },
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Theme change published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish theme change: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish room settings change event
   */
  async publishRoomSettingsChange(
    roomId: string,
    settingsData: RoomSettingsNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `⚙️ Publishing room settings change for ${roomId}: ${settingsData.settingKey} changed by ${settingsData.changedBy}`,
      );

      const mutation = `
        mutation PublishSettingsEvent($roomId: ID!, $settingsData: AWSJSON!) {
          publishSettingsEvent(roomId: $roomId, settingsData: $settingsData) {
            id
            timestamp
            roomId
            eventType
            settingKey
            oldValue
            newValue
            changedBy
            category
          }
        }
      `;

      const variables = {
        roomId,
        settingsData: {
          settingKey: settingsData.settingKey,
          oldValue: settingsData.oldValue,
          newValue: settingsData.newValue,
          changedBy: settingsData.changedBy,
          category: settingsData.category.toUpperCase(),
        },
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Room settings change published successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to publish room settings change: ${error.message}`,
      );
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish chat message event
   */
  async publishChatMessage(
    roomId: string,
    chatData: ChatMessageNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `💬 Publishing chat message for room ${roomId}: ${chatData.type} from ${chatData.username}`,
      );

      const mutation = `
        mutation PublishChatEvent($roomId: ID!, $chatData: AWSJSON!) {
          publishChatEvent(roomId: $roomId, chatData: $chatData) {
            id
            timestamp
            roomId
            eventType
            messageId
            userId
            username
            content
            messageType
            action
            metadata
          }
        }
      `;

      const variables = {
        roomId,
        chatData: {
          messageId: chatData.messageId,
          userId: chatData.userId,
          username: chatData.username,
          content: chatData.message?.content || chatData.data?.content,
          messageType: 'TEXT',
          action: chatData.type.toUpperCase(),
          metadata: chatData.data,
        },
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Chat message published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish chat message: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Publish content suggestion event
   */
  async publishContentSuggestion(
    roomId: string,
    suggestionData: ContentSuggestionNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `💡 Publishing content suggestion for room ${roomId}: ${suggestionData.type} by ${suggestionData.username}`,
      );

      const mutation = `
        mutation PublishSuggestionEvent($roomId: ID!, $suggestionData: AWSJSON!) {
          publishSuggestionEvent(roomId: $roomId, suggestionData: $suggestionData) {
            id
            timestamp
            roomId
            eventType
            suggestionId
            userId
            username
            action
            suggestion
            vote
            comment
          }
        }
      `;

      const variables = {
        roomId,
        suggestionData: {
          suggestionId: suggestionData.suggestionId,
          userId: suggestionData.userId,
          username: suggestionData.username,
          action: suggestionData.type.toUpperCase(),
          suggestion: suggestionData.suggestion,
          vote: suggestionData.vote,
          comment: suggestionData.comment,
        },
      };

      await this.executeMutation(mutation, variables);
      this.logger.log(`✅ Content suggestion published successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to publish content suggestion: ${error.message}`,
      );
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Health check for AppSync connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      // If AppSync client is not initialized, it's not healthy
      if (!this.appSyncClient || !this.config.apiUrl || !this.config.apiKey) {
        return false;
      }

      // Validate URL format first
      if (!this.isValidHttpsUrl(this.config.apiUrl)) {
        this.logger.error(`Invalid AppSync URL format: ${this.config.apiUrl}`);
        return false;
      }

      // Try to get API information to verify connection
      const apiId = this.extractApiIdFromUrl(this.config.apiUrl);
      if (!apiId) {
        this.logger.error(`Could not extract API ID from URL: ${this.config.apiUrl}`);
        return false;
      }

      const command = new GetGraphqlApiCommand({
        apiId: apiId,
      });

      await this.appSyncClient.send(command);
      return true;
    } catch (error) {
      this.logger.error(`AppSync health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract API ID from AppSync URL
   */
  private extractApiIdFromUrl(url: string): string {
    try {
      const match = url.match(/https:\/\/([^.]+)\.appsync/);
      return match ? match[1] : '';
    } catch (error) {
      this.logger.error(`Error extracting API ID from URL: ${error.message}`);
      return '';
    }
  }

  /**
   * Get connection statistics (placeholder for compatibility)
   */
  getConnectionStats() {
    return {
      type: 'AppSync',
      apiUrl: this.config.apiUrl,
      region: this.config.region,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
