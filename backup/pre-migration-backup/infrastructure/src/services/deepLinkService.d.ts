import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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
    metadata?: {
        [key: string]: any;
    };
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
export declare class DeepLinkService {
    private readonly INVITE_CODE_LENGTH;
    private readonly DEFAULT_EXPIRY_HOURS;
    private readonly MAX_GENERATION_ATTEMPTS;
    private readonly BASE_URL;
    private docClient;
    constructor(docClient?: DynamoDBDocumentClient);
    /**
     * Generate a unique invite link for a room
     */
    generateInviteLink(roomId: string, createdBy: string, options?: {
        expiryHours?: number;
        maxUsage?: number;
    }): Promise<InviteLink>;
    /**
     * Validate an invite code and return room information
     */
    validateInviteCode(code: string): Promise<RoomInfo | null>;
    /**
     * Handle deep link URL and return appropriate action
     */
    handleDeepLink(url: string): Promise<DeepLinkAction>;
    /**
     * Get all active invite links for a room
     */
    getRoomInviteLinks(roomId: string): Promise<InviteLink[]>;
    /**
     * Deactivate an invite code
     */
    deactivateInviteCode(code: string): Promise<void>;
    /**
     * Generate a unique invite code
     */
    private generateUniqueInviteCode;
    /**
     * Generate a random invite code
     */
    private generateRandomCode;
    /**
     * Check if an invite code already exists
     */
    private checkCodeExists;
    /**
     * Extract invite code from URL
     */
    private extractInviteCodeFromUrl;
    /**
     * Get room information by ID
     */
    private getRoomInfo;
    /**
     * Increment usage count for an invite code
     */
    private incrementUsageCount;
    /**
     * Clean up expired invite codes (maintenance function)
     */
    cleanupExpiredInvites(): Promise<number>;
    /**
     * Get invite link statistics
     */
    getInviteStats(code: string): Promise<{
        code: string;
        usageCount: number;
        maxUsage?: number;
        isActive: boolean;
        expiresAt: string;
        createdAt: string;
    } | null>;
}
export declare const deepLinkService: DeepLinkService;
