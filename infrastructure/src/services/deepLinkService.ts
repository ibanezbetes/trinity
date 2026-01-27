import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';

export interface InviteLink {
  code: string;
  url: string;
  roomId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  usageCount: number;
  maxUsage?: number;
}

export interface DeepLinkAction {
  type: 'JOIN_ROOM' | 'INVALID_CODE' | 'EXPIRED_CODE' | 'ERROR';
  roomId?: string;
  errorMessage?: string;
  metadata?: { [key: string]: any };
}

export interface RoomInfo {
  roomId: string;
  name: string;
  hostId: string;
  status: string;
  memberCount: number;
  isPrivate: boolean;
  createdAt: string;
}

/**
 * Deep Link Service
 * Handles invite code generation, validation, and deep link routing
 */
export class DeepLinkService {
  private readonly INVITE_CODE_LENGTH = 6;
  private readonly DEFAULT_EXPIRY_HOURS = 168; // 7 days
  private readonly MAX_GENERATION_ATTEMPTS = 10;
  private readonly BASE_URL = 'https://trinity.app';
  private docClient: DynamoDBDocumentClient;

  constructor(docClient?: DynamoDBDocumentClient) {
    if (docClient) {
      this.docClient = docClient;
    } else {
      const dynamoClient = new DynamoDBClient({});
      this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    }
  }

  /**
   * Generate a unique invite link for a room
   */
  async generateInviteLink(
    roomId: string,
    createdBy: string,
    options?: {
      expiryHours?: number;
      maxUsage?: number;
    }
  ): Promise<InviteLink> {
    const timer = new PerformanceTimer('GenerateInviteLink');
    console.log(`🔗 Generating invite link for room ${roomId} by user ${createdBy}`);

    try {
      // Generate unique invite code
      const inviteCode = await this.generateUniqueInviteCode();

      // Calculate expiry time
      const expiryHours = options?.expiryHours || this.DEFAULT_EXPIRY_HOURS;
      const expiresAt = new Date(Date.now() + (expiryHours * 60 * 60 * 1000)).toISOString();

      // Create invite link object
      const inviteLink: InviteLink = {
        code: inviteCode,
        url: `${this.BASE_URL}/room/${inviteCode}`,
        roomId,
        createdBy,
        createdAt: new Date().toISOString(),
        expiresAt,
        isActive: true,
        usageCount: 0,
        maxUsage: options?.maxUsage,
      };

      // Store in DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: process.env.ROOM_INVITES_TABLE!,
        Item: {
          PK: inviteCode, // Primary key is the invite code
          SK: 'INVITE',   // Sort key for invite links
          ...inviteLink,
        },
        ConditionExpression: 'attribute_not_exists(PK)', // Ensure uniqueness
      }));

      // Also create a reverse lookup by roomId for management
      await this.docClient.send(new PutCommand({
        TableName: process.env.ROOM_INVITES_TABLE!,
        Item: {
          PK: roomId,
          SK: `INVITE#${inviteCode}`,
          inviteCode,
          createdAt: inviteLink.createdAt,
          expiresAt: inviteLink.expiresAt,
          isActive: true,
        },
      }));

      // Log business metric
      logBusinessMetric('INVITE_LINK_CREATED', roomId, createdBy, {
        inviteCode,
        expiryHours,
        maxUsage: options?.maxUsage,
      });

      console.log(`✅ Invite link generated: ${inviteLink.url} (expires: ${expiresAt})`);
      timer.finish(true, undefined, { inviteCode, roomId });
      return inviteLink;

    } catch (error) {
      logError('GenerateInviteLink', error as Error, { roomId, createdBy });
      timer.finish(false, (error as Error).name);
      throw error;
    }
  }

  /**
   * Validate an invite code and return room information
   */
  async validateInviteCode(code: string): Promise<RoomInfo | null> {
    const timer = new PerformanceTimer('ValidateInviteCode');
    console.log(`🔍 Validating invite code: ${code}`);

    try {
      // FIXED: Search directly in ROOMS_TABLE by inviteCode using Scan
      // Instead of using a separate INVITE_LINKS_TABLE that doesn't exist

      const response = await this.docClient.send(new ScanCommand({
        TableName: process.env.ROOMS_TABLE!,
        FilterExpression: 'inviteCode = :code',
        ExpressionAttributeValues: {
          ':code': code,
        },
        Limit: 1,
      }));

      if (!response.Items || response.Items.length === 0) {
        console.log(`❌ Invite code not found in ROOMS_TABLE: ${code}`);
        timer.finish(true, undefined, { result: 'not_found' });
        return null;
      }

      const room = response.Items[0] as any;

      // Check if room is active
      if (!room.isActive) {
        console.log(`❌ Room is inactive: ${code}`);
        timer.finish(true, undefined, { result: 'inactive' });
        return null;
      }

      // Check if room is in a valid state for joining
      if (room.status === 'COMPLETED' || room.status === 'CANCELLED') {
        console.log(`❌ Room is ${room.status}: ${code}`);
        timer.finish(true, undefined, { result: 'room_closed' });
        return null;
      }

      // Check if room is full
      if (room.maxMembers && room.memberCount >= room.maxMembers) {
        console.log(`❌ Room is full: ${code} (${room.memberCount}/${room.maxMembers})`);
        timer.finish(true, undefined, { result: 'room_full' });
        return null;
      }

      // Return room information
      const roomInfo: RoomInfo = {
        roomId: room.id || room.roomId,
        name: room.name,
        hostId: room.hostId,
        status: room.status,
        memberCount: room.memberCount,
        isPrivate: room.isPrivate,
        createdAt: room.createdAt,
      };

      console.log(`✅ Invite code validated: ${code} -> Room: ${roomInfo.name}`);
      timer.finish(true, undefined, { result: 'valid', roomId: roomInfo.roomId });
      return roomInfo;

    } catch (error) {
      logError('ValidateInviteCode', error as Error, { code });
      timer.finish(false, (error as Error).name);
      throw error;
    }
  }

  /**
   * Handle deep link URL and return appropriate action
   */
  async handleDeepLink(url: string): Promise<DeepLinkAction> {
    const timer = new PerformanceTimer('HandleDeepLink');
    console.log(`🔗 Handling deep link: ${url}`);

    try {
      // Parse URL to extract invite code
      const inviteCode = this.extractInviteCodeFromUrl(url);
      if (!inviteCode) {
        console.log(`❌ Invalid deep link format: ${url}`);
        timer.finish(true, undefined, { result: 'invalid_format' });
        return {
          type: 'ERROR',
          errorMessage: 'Invalid invite link format',
        };
      }

      // Validate invite code
      const roomInfo = await this.validateInviteCode(inviteCode);
      if (!roomInfo) {
        console.log(`❌ Invalid or expired invite code: ${inviteCode}`);
        timer.finish(true, undefined, { result: 'invalid_code' });
        return {
          type: 'INVALID_CODE',
          errorMessage: 'This invite link is invalid or has expired',
        };
      }

      // Check room status
      if (roomInfo.status === 'COMPLETED' || roomInfo.status === 'INACTIVE') {
        console.log(`❌ Room is not available: ${roomInfo.roomId} (status: ${roomInfo.status})`);
        timer.finish(true, undefined, { result: 'room_unavailable' });
        return {
          type: 'INVALID_CODE',
          errorMessage: 'This room is no longer available',
        };
      }

      // Increment usage count
      await this.incrementUsageCount(inviteCode);

      console.log(`✅ Deep link handled successfully: ${inviteCode} -> ${roomInfo.roomId}`);
      timer.finish(true, undefined, { result: 'success', roomId: roomInfo.roomId });
      return {
        type: 'JOIN_ROOM',
        roomId: roomInfo.roomId,
        metadata: {
          roomName: roomInfo.name,
          hostId: roomInfo.hostId,
          memberCount: roomInfo.memberCount,
          inviteCode,
        },
      };

    } catch (error) {
      logError('HandleDeepLink', error as Error, { url });
      timer.finish(false, (error as Error).name);
      return {
        type: 'ERROR',
        errorMessage: 'An error occurred while processing the invite link',
      };
    }
  }

  /**
   * Get all active invite links for a room
   */
  async getRoomInviteLinks(roomId: string): Promise<InviteLink[]> {
    try {
      const response = await this.docClient.send(new QueryCommand({
        TableName: process.env.ROOM_INVITES_TABLE!,
        KeyConditionExpression: 'PK = :roomId AND begins_with(SK, :invitePrefix)',
        ExpressionAttributeValues: {
          ':roomId': roomId,
          ':invitePrefix': 'INVITE#',
        },
      }));

      if (!response.Items || response.Items.length === 0) {
        return [];
      }

      // Get full invite link details for each code
      const inviteLinks: InviteLink[] = [];
      for (const item of response.Items) {
        const fullInvite = await this.docClient.send(new GetCommand({
          TableName: process.env.ROOM_INVITES_TABLE!,
          Key: { PK: item.inviteCode, SK: 'INVITE' },
        }));

        if (fullInvite.Item) {
          inviteLinks.push(fullInvite.Item as InviteLink);
        }
      }

      // Filter active and non-expired invites
      const now = new Date();
      return inviteLinks.filter(invite =>
        invite.isActive && new Date(invite.expiresAt) > now
      );

    } catch (error) {
      console.error('❌ Error getting room invite links:', error);
      return [];
    }
  }

  /**
   * Deactivate an invite code
   */
  async deactivateInviteCode(code: string): Promise<void> {
    try {
      await this.docClient.send(new UpdateCommand({
        TableName: process.env.ROOM_INVITES_TABLE!,
        Key: { PK: code, SK: 'INVITE' },
        UpdateExpression: 'SET isActive = :inactive, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':inactive': false,
          ':updatedAt': new Date().toISOString(),
        },
        ConditionExpression: 'attribute_exists(PK)',
      }));

      console.log(`🔒 Invite code deactivated: ${code}`);
    } catch (error) {
      console.error('❌ Error deactivating invite code:', error);
      throw error;
    }
  }

  /**
   * Generate a unique invite code
   */
  private async generateUniqueInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < this.MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = this.generateRandomCode();

      // Check if code already exists
      const exists = await this.checkCodeExists(code);
      if (!exists) {
        return code;
      }

      console.log(`🔄 Invite code collision, retrying: ${code} (attempt ${attempt + 1})`);
    }

    throw new Error('Failed to generate unique invite code after maximum attempts');
  }

  /**
   * Generate a random invite code
   */
  private generateRandomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';

    for (let i = 0; i < this.INVITE_CODE_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * Check if an invite code already exists
   */
  private async checkCodeExists(code: string): Promise<boolean> {
    try {
      const response = await this.docClient.send(new GetCommand({
        TableName: process.env.ROOM_INVITES_TABLE!,
        Key: { PK: code, SK: 'INVITE' },
      }));

      return !!response.Item;
    } catch (error) {
      console.error('❌ Error checking code existence:', error);
      return true; // Assume exists to be safe
    }
  }

  /**
   * Extract invite code from URL
   */
  private extractInviteCodeFromUrl(url: string): string | null {
    try {
      // Handle different URL formats:
      // https://trinity.app/room/ABC123
      // trinity.app/room/ABC123
      // /room/ABC123 (only if it's a relative path)
      // ABC123 (direct code)

      const patterns = [
        /^https?:\/\/trinity\.app\/room\/([A-Z0-9]{6})$/i,
        /^trinity\.app\/room\/([A-Z0-9]{6})$/i,
        /^\/room\/([A-Z0-9]{6})$/i,
        /^([A-Z0-9]{6})$/i,
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1].toUpperCase();
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Error extracting invite code from URL:', error);
      return null;
    }
  }

  /**
   * Get room information by ID
   */
  private async getRoomInfo(roomId: string): Promise<RoomInfo | null> {
    try {
      const response = await this.docClient.send(new GetCommand({
        TableName: process.env.ROOMS_TABLE!,
        Key: { PK: roomId, SK: 'ROOM' },
      }));

      if (!response.Item) {
        return null;
      }

      const room = response.Item;
      return {
        roomId: room.roomId || roomId,
        name: room.name || 'Unnamed Room',
        hostId: room.hostId,
        status: room.status,
        memberCount: room.memberCount || 0,
        isPrivate: room.isPrivate || false,
        createdAt: room.createdAt,
      };
    } catch (error) {
      console.error('❌ Error getting room info:', error);
      return null;
    }
  }

  /**
   * Increment usage count for an invite code
   */
  private async incrementUsageCount(code: string): Promise<void> {
    try {
      await this.docClient.send(new UpdateCommand({
        TableName: process.env.ROOM_INVITES_TABLE!,
        Key: { PK: code, SK: 'INVITE' },
        UpdateExpression: 'ADD usageCount :increment SET updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':increment': 1,
          ':updatedAt': new Date().toISOString(),
        },
        ConditionExpression: 'attribute_exists(PK)',
      }));
    } catch (error) {
      console.error('❌ Error incrementing usage count:', error);
      // Don't throw - this is not critical for the join process
    }
  }

  /**
   * Clean up expired invite codes (maintenance function)
   */
  async cleanupExpiredInvites(): Promise<number> {
    console.log('🧹 Starting cleanup of expired invite codes');
    let cleanedCount = 0;

    try {
      // This would typically be implemented as a scheduled job
      // For now, we'll just mark it as a placeholder
      console.log('⚠️ Cleanup function not fully implemented - would be run as scheduled job');
      return cleanedCount;
    } catch (error) {
      console.error('❌ Error during invite cleanup:', error);
      return cleanedCount;
    }
  }

  /**
   * Get invite link statistics
   */
  async getInviteStats(code: string): Promise<{
    code: string;
    usageCount: number;
    maxUsage?: number;
    isActive: boolean;
    expiresAt: string;
    createdAt: string;
  } | null> {
    try {
      const response = await this.docClient.send(new GetCommand({
        TableName: process.env.ROOM_INVITES_TABLE!,
        Key: { PK: code, SK: 'INVITE' },
      }));

      if (!response.Item) {
        return null;
      }

      const invite = response.Item as InviteLink;
      return {
        code: invite.code,
        usageCount: invite.usageCount,
        maxUsage: invite.maxUsage,
        isActive: invite.isActive,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      };
    } catch (error) {
      console.error('❌ Error getting invite stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export const deepLinkService = new DeepLinkService();