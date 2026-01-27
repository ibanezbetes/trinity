import { Linking, Alert, AlertButton } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { roomService } from './roomService';
import { cognitoAuthService } from './cognitoAuthService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DeepLinkHandler {
  (url: string): void;
}

export interface InviteLinkData {
  inviteCode: string;
  roomId?: string;
  roomName?: string;
}

class DeepLinkService {
  private handlers: Map<string, DeepLinkHandler> = new Map();
  private isInitialized = false;

  /**
   * Initialize the deep linking service
   */
  initialize(): void {
    if (this.isInitialized) {
      console.log('🔗 DeepLinkService already initialized');
      return;
    }

    console.log('🔗 Initializing DeepLinkService');
    
    // Configure WebBrowser for OAuth
    WebBrowser.maybeCompleteAuthSession();

    // Listen for URL changes
    Linking.addEventListener('url', this.handleDeepLink.bind(this));

    // Handle initial URL if app was opened from a deep link
    this.handleInitialURL();

    // Register default handlers
    this.registerDefaultHandlers();

    this.isInitialized = true;
  }

  /**
   * Register default handlers for Trinity app
   */
  private registerDefaultHandlers(): void {
    // Handle invite links: trinity://room/ABC123 or trinity://invite/ABC123
    this.registerHandler('/room', this.handleInviteLink.bind(this));
    this.registerHandler('/invite', this.handleInviteLink.bind(this));
    
    // Handle OAuth callback
    this.registerHandler('/auth/callback', this.handleOAuthCallback.bind(this));
  }

  /**
   * Handle initial URL when app is opened from deep link
   */
  private async handleInitialURL(): Promise<void> {
    try {
      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        console.log('🔗 Handling initial URL:', initialURL);
        // Add a small delay to ensure app is fully loaded
        setTimeout(() => {
          this.handleDeepLink({ url: initialURL });
        }, 1000);
      }
    } catch (error) {
      console.error('❌ Error handling initial URL:', error);
    }
  }

  /**
   * Handle deep link
   */
  private handleDeepLink(event: { url: string }): void {
    const { url } = event;
    console.log('📱 Deep link received:', url);

    try {
      const parsedURL = new URL(url);
      let path = parsedURL.pathname;
      
      // Handle case where pathname is empty (e.g., trinity://custom)
      if (!path || path === '/') {
        path = `/${parsedURL.hostname}`;
      }

      // Find handler for this route
      const handler = this.handlers.get(path);
      if (handler) {
        handler(url);
      } else {
        console.warn('⚠️ No handler for deep link path:', path);
        // Try to extract invite code from various URL formats
        this.handleGenericInviteLink(url);
      }
    } catch (error) {
      console.error('❌ Error processing deep link:', error);
      // Try to handle as a simple invite code
      this.handleGenericInviteLink(url);
    }
  }

  /**
   * Handle invite links (trinity://room/ABC123 or trinity://invite/ABC123)
   */
  private async handleInviteLink(url: string): Promise<void> {
    console.log('🎬 Handling invite link:', url);

    try {
      const inviteData = this.extractInviteCode(url);
      if (!inviteData) {
        Alert.alert(
          'Invalid Invite Link',
          'The invite link format is not valid. Please check the link and try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      console.log('🔍 Extracted invite code:', inviteData.inviteCode);

      // Check if user is authenticated before attempting to join
      const authResult = await cognitoAuthService.checkStoredAuth();
      if (!authResult.isAuthenticated) {
        console.log('🔒 User not authenticated, redirecting to login');
        
        // Store the invite code for after login
        await this.storeInviteCodeForLater(inviteData.inviteCode);
        
        const buttons: AlertButton[] = [
          { text: 'Cancel' },
          {
            text: 'Sign In',
            onPress: () => {
              router.push('/login');
            }
          }
        ];
        
        Alert.alert(
          'Sign In Required',
          'You need to sign in to join this room. After signing in, you\'ll automatically be taken to the room.',
          buttons
        );
        return;
      }

      // Show loading state
      Alert.alert(
        'Joining Room',
        'Please wait while we connect you to the room...',
        [],
        { cancelable: false }
      );

      // Join the room using the invite code
      const room = await roomService.joinRoom(inviteData.inviteCode);
      
      console.log('✅ Successfully joined room:', room.name);

      // Dismiss loading alert and navigate to room
      Alert.alert(
        'Welcome!',
        `You've joined "${room.name}". Get ready to vote on movies!`,
        [
          {
            text: 'Start Voting',
            onPress: () => {
              router.push(`/room/${room.id}`);
            }
          }
        ]
      );

    } catch (error) {
      console.error('❌ Error joining room from invite link:', error);
      
      let errorMessage = 'Unable to join the room. Please try again.';
      let showLoginOption = false;
      
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('expired')) {
          errorMessage = 'This invite link has expired. Please ask for a new one.';
        } else if (message.includes('invalid')) {
          errorMessage = 'This invite link is invalid. Please check the link and try again.';
        } else if (message.includes('full')) {
          errorMessage = 'This room is full. Please try again later.';
        } else if (message.includes('not authenticated') || message.includes('unauthorized')) {
          errorMessage = 'You need to sign in to join this room.';
          showLoginOption = true;
        }
      }

      // Check if it's a 401 error from the API response
      if (error && typeof error === 'object' && 'response' in error) {
        const apiError = error as { response?: { status?: number } };
        if (apiError.response?.status === 401) {
          errorMessage = 'You need to sign in to join this room.';
          showLoginOption = true;
        }
      }

      const alertButtons: AlertButton[] = [{ text: 'OK' }];
      
      if (showLoginOption) {
        // Store the invite code for after login
        await this.storeInviteCodeForLater(this.extractInviteCode(url)?.inviteCode || '');
        
        alertButtons.push({
          text: 'Sign In',
          onPress: () => router.push('/login')
        });
      } else {
        alertButtons.push({
          text: 'Go to Home',
          onPress: () => router.push('/home')
        });
      }

      Alert.alert(
        'Unable to Join Room',
        errorMessage,
        alertButtons
      );
    }
  }

  /**
   * Handle OAuth callback
   */
  private handleOAuthCallback(url: string): void {
    console.log('🔐 Handling OAuth callback:', url);
    // OAuth callback handling logic would go here
    // This is already handled by the existing auth services
  }

  /**
   * Handle generic invite links that don't match expected patterns
   */
  private handleGenericInviteLink(url: string): void {
    console.log('🔍 Attempting to handle generic invite link:', url);
    
    const inviteData = this.extractInviteCode(url);
    if (inviteData) {
      this.handleInviteLink(url);
    } else {
      console.warn('⚠️ Could not extract invite code from URL:', url);
    }
  }

  /**
   * Extract invite code from various URL formats
   */
  private extractInviteCode(url: string): InviteLinkData | null {
    try {
      // Handle different URL formats:
      // trinity://room/ABC123
      // trinity://invite/ABC123
      // https://trinity.app/room/ABC123
      // trinity.app/room/ABC123
      // /room/ABC123
      // ABC123
      
      const patterns = [
        // Trinity app scheme - must end after the code
        /^trinity:\/\/(?:room|invite)\/([A-Z0-9]{6})(?:\/.*)?$/i,
        // HTTPS URLs - must be trinity.app domain and end after the code
        /^https?:\/\/trinity\.app\/room\/([A-Z0-9]{6})(?:\/.*)?$/i,
        // Domain without protocol - must be trinity.app
        /^trinity\.app\/room\/([A-Z0-9]{6})(?:\/.*)?$/i,
        // Path only - must start with /room/
        /^\/room\/([A-Z0-9]{6})(?:\/.*)?$/i,
        // Direct code - must be exactly 6 characters
        /^([A-Z0-9]{6})$/i,
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return {
            inviteCode: match[1].toUpperCase(),
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error extracting invite code:', error);
      return null;
    }
  }

  /**
   * Register handler for a specific route
   */
  registerHandler(path: string, handler: DeepLinkHandler): void {
    this.handlers.set(path, handler);
    console.log('✅ Handler registered for:', path);
  }

  /**
   * Unregister handler
   */
  unregisterHandler(path: string): void {
    this.handlers.delete(path);
    console.log('🗑️ Handler unregistered for:', path);
  }

  /**
   * Open external URL
   */
  async openURL(url: string): Promise<void> {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        console.error('❌ Cannot open URL:', url);
      }
    } catch (error) {
      console.error('❌ Error opening URL:', error);
    }
  }

  /**
   * Get OAuth callback URL
   */
  getOAuthCallbackURL(): string {
    return 'trinity://auth/callback';
  }

  /**
   * Generate invite link for sharing
   */
  generateInviteLink(inviteCode: string): string {
    return `trinity://room/${inviteCode}`;
  }

  /**
   * Generate web invite link for sharing outside the app
   */
  generateWebInviteLink(inviteCode: string): string {
    return `https://trinity.app/room/${inviteCode}`;
  }

  /**
   * Test if a URL is a valid Trinity invite link
   */
  isValidInviteLink(url: string): boolean {
    return this.extractInviteCode(url) !== null;
  }

  /**
   * Store invite code for after authentication
   */
  private async storeInviteCodeForLater(inviteCode: string): Promise<void> {
    try {
      await AsyncStorage.setItem('pendingInviteCode', inviteCode);
      console.log('💾 Stored pending invite code:', inviteCode);
    } catch (error) {
      console.error('❌ Error storing pending invite code:', error);
    }
  }

  /**
   * Retrieve and clear stored invite code
   */
  async getPendingInviteCode(): Promise<string | null> {
    try {
      const inviteCode = await AsyncStorage.getItem('pendingInviteCode');
      if (inviteCode) {
        await AsyncStorage.removeItem('pendingInviteCode');
        console.log('📥 Retrieved pending invite code:', inviteCode);
        return inviteCode;
      }
      return null;
    } catch (error) {
      console.error('❌ Error retrieving pending invite code:', error);
      return null;
    }
  }

  /**
   * Handle pending invite code after successful authentication
   */
  async handlePendingInviteCode(): Promise<void> {
    const pendingCode = await this.getPendingInviteCode();
    if (pendingCode) {
      console.log('🔄 Processing pending invite code after authentication:', pendingCode);
      // Reconstruct the invite URL and handle it
      const inviteUrl = `trinity://room/${pendingCode}`;
      await this.handleInviteLink(inviteUrl);
    }
  }

  /**
   * Clean up listeners
   */
  cleanup(): void {
    Linking.removeAllListeners('url');
    this.handlers.clear();
    this.isInitialized = false;
    console.log('🧹 DeepLinkService cleaned up');
  }
}

// Export singleton instance
export const deepLinkService = new DeepLinkService();