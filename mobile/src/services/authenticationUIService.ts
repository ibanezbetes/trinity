/**
 * Authentication UI Service
 * Handles authentication screens with new error messages,
 * loading states and user feedback for authentication flows,
 * and consistent user experience across authentication methods
 */

import { loggingService } from './loggingService';
import { authStateBroadcastService } from './authStateBroadcastService';
import { coordinatedErrorHandlingService } from './coordinatedErrorHandlingService';
import { sessionTimeoutService } from './sessionTimeoutService';
import { securityMonitoringService } from './securityMonitoringService';

export interface AuthUIConfig {
  enableLoadingStates: boolean;
  enableProgressIndicators: boolean;
  enableUserFeedback: boolean;
  enableErrorTranslation: boolean;
  enableSecurityWarnings: boolean;
  enableSessionWarnings: boolean;
  showDetailedErrors: boolean;
  autoHideSuccessMessages: boolean;
  successMessageDurationMs: number;
  errorMessageDurationMs: number;
  enableHapticFeedback: boolean;
  enableSoundFeedback: boolean;
  theme: 'light' | 'dark' | 'auto';
  language: string;
}

export interface UIState {
  isLoading: boolean;
  loadingMessage?: string;
  progress?: number;
  error?: UIError;
  success?: UISuccess;
  warnings?: UIWarning[];
  currentScreen: AuthScreen;
  previousScreen?: AuthScreen;
  canGoBack: boolean;
  formData: Record<string, any>;
  validationErrors: Record<string, string>;
}

export interface UIError {
  id: string;
  type: UIErrorType;
  title: string;
  message: string;
  details?: string;
  actionable: boolean;
  actions?: UIAction[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  dismissible: boolean;
  autoHide: boolean;
}

export interface UISuccess {
  id: string;
  title: string;
  message: string;
  icon?: string;
  timestamp: number;
  autoHide: boolean;
  duration: number;
}

export interface UIWarning {
  id: string;
  type: UIWarningType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  timestamp: number;
  dismissible: boolean;
  actions?: UIAction[];
}

export interface UIAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'destructive' | 'link';
  handler: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
}

export type UIErrorType = 
  | 'network_error'
  | 'authentication_error'
  | 'validation_error'
  | 'security_error'
  | 'session_error'
  | 'service_error'
  | 'unknown_error';

export type UIWarningType =
  | 'security_warning'
  | 'session_warning'
  | 'network_warning'
  | 'performance_warning';

export type AuthScreen =
  | 'login'
  | 'register'
  | 'forgot_password'
  | 'reset_password'
  | 'google_signin'
  | 'two_factor'
  | 'account_locked'
  | 'session_expired'
  | 'loading'
  | 'success'
  | 'error';

export interface AuthFormData {
  email?: string;
  password?: string;
  confirmPassword?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  twoFactorCode?: string;
  resetToken?: string;
}

export interface ValidationRule {
  field: string;
  rules: Array<{
    type: 'required' | 'email' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
    value?: any;
    message: string;
    validator?: (value: any) => boolean;
  }>;
}

class AuthenticationUIService {
  private config: AuthUIConfig = {
    enableLoadingStates: true,
    enableProgressIndicators: true,
    enableUserFeedback: true,
    enableErrorTranslation: true,
    enableSecurityWarnings: true,
    enableSessionWarnings: true,
    showDetailedErrors: false,
    autoHideSuccessMessages: true,
    successMessageDurationMs: 3000,
    errorMessageDurationMs: 5000,
    enableHapticFeedback: true,
    enableSoundFeedback: false,
    theme: 'auto',
    language: 'en',
  };

  private uiState: UIState = {
    isLoading: false,
    currentScreen: 'login',
    canGoBack: false,
    formData: {},
    validationErrors: {},
    warnings: [],
  };

  private stateListeners: Array<(state: UIState) => void> = [];
  private messageTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private validationRules: Map<AuthScreen, ValidationRule[]> = new Map();

  constructor() {
    this.initializeValidationRules();
    this.setupServiceListeners();
    
    loggingService.info('AuthenticationUI', 'Authentication UI service initialized', {
      config: this.config,
    });
  }

  /**
   * Navigate to authentication screen
   */
  navigateToScreen(screen: AuthScreen, data?: any): void {
    const previousScreen = this.uiState.currentScreen;
    
    this.updateUIState({
      previousScreen,
      currentScreen: screen,
      canGoBack: this.canNavigateBack(screen, previousScreen),
      formData: data ? { ...this.uiState.formData, ...data } : this.uiState.formData,
      error: undefined, // Clear errors on navigation
      success: undefined, // Clear success messages on navigation
    });

    loggingService.debug('AuthenticationUI', 'Navigated to screen', {
      from: previousScreen,
      to: screen,
      data: data ? Object.keys(data) : [],
    });
  }

  /**
   * Go back to previous screen
   */
  goBack(): boolean {
    if (!this.uiState.canGoBack || !this.uiState.previousScreen) {
      return false;
    }

    this.navigateToScreen(this.uiState.previousScreen);
    return true;
  }

  /**
   * Show loading state
   */
  showLoading(message?: string, progress?: number): void {
    this.updateUIState({
      isLoading: true,
      loadingMessage: message,
      progress,
    });

    if (this.config.enableHapticFeedback) {
      this.triggerHapticFeedback('light');
    }
  }

  /**
   * Hide loading state
   */
  hideLoading(): void {
    this.updateUIState({
      isLoading: false,
      loadingMessage: undefined,
      progress: undefined,
    });
  }

  /**
   * Show error message
   */
  showError(error: Partial<UIError> & { message: string }): void {
    const uiError: UIError = {
      id: error.id || this.generateId(),
      type: error.type || 'unknown_error',
      title: error.title || this.getErrorTitle(error.type || 'unknown_error'),
      message: error.message,
      details: error.details,
      actionable: error.actionable || false,
      actions: error.actions || [],
      severity: error.severity || 'medium',
      timestamp: Date.now(),
      dismissible: error.dismissible !== false,
      autoHide: error.autoHide !== false,
    };

    this.updateUIState({
      error: uiError,
      isLoading: false,
    });

    // Auto-hide error if configured
    if (uiError.autoHide) {
      const timeout = setTimeout(() => {
        this.clearError(uiError.id);
      }, this.config.errorMessageDurationMs);
      
      this.messageTimeouts.set(uiError.id, timeout);
    }

    // Trigger feedback
    if (this.config.enableHapticFeedback) {
      this.triggerHapticFeedback(uiError.severity === 'high' ? 'error' : 'warning');
    }

    loggingService.warn('AuthenticationUI', 'Error displayed to user', {
      errorId: uiError.id,
      type: uiError.type,
      severity: uiError.severity,
    });
  }

  /**
   * Show success message
   */
  showSuccess(success: Partial<UISuccess> & { message: string }): void {
    const uiSuccess: UISuccess = {
      id: success.id || this.generateId(),
      title: success.title || 'Success',
      message: success.message,
      icon: success.icon || 'checkmark',
      timestamp: Date.now(),
      autoHide: success.autoHide !== false,
      duration: success.duration || this.config.successMessageDurationMs,
    };

    this.updateUIState({
      success: uiSuccess,
      error: undefined, // Clear errors when showing success
      isLoading: false,
    });

    // Auto-hide success message if configured
    if (uiSuccess.autoHide) {
      const timeout = setTimeout(() => {
        this.clearSuccess(uiSuccess.id);
      }, uiSuccess.duration);
      
      this.messageTimeouts.set(uiSuccess.id, timeout);
    }

    // Trigger feedback
    if (this.config.enableHapticFeedback) {
      this.triggerHapticFeedback('success');
    }

    loggingService.info('AuthenticationUI', 'Success message displayed', {
      successId: uiSuccess.id,
      message: uiSuccess.message,
    });
  }

  /**
   * Show warning message
   */
  showWarning(warning: Partial<UIWarning> & { message: string }): void {
    const uiWarning: UIWarning = {
      id: warning.id || this.generateId(),
      type: warning.type || 'security_warning',
      title: warning.title || this.getWarningTitle(warning.type || 'security_warning'),
      message: warning.message,
      severity: warning.severity || 'warning',
      timestamp: Date.now(),
      dismissible: warning.dismissible !== false,
      actions: warning.actions || [],
    };

    const currentWarnings = this.uiState.warnings || [];
    this.updateUIState({
      warnings: [...currentWarnings, uiWarning],
    });

    loggingService.info('AuthenticationUI', 'Warning displayed', {
      warningId: uiWarning.id,
      type: uiWarning.type,
      severity: uiWarning.severity,
    });
  }

  /**
   * Clear error message
   */
  clearError(errorId?: string): void {
    if (!errorId || (this.uiState.error && this.uiState.error.id === errorId)) {
      this.updateUIState({ error: undefined });
    }

    if (errorId && this.messageTimeouts.has(errorId)) {
      clearTimeout(this.messageTimeouts.get(errorId)!);
      this.messageTimeouts.delete(errorId);
    }
  }

  /**
   * Clear success message
   */
  clearSuccess(successId?: string): void {
    if (!successId || (this.uiState.success && this.uiState.success.id === successId)) {
      this.updateUIState({ success: undefined });
    }

    if (successId && this.messageTimeouts.has(successId)) {
      clearTimeout(this.messageTimeouts.get(successId)!);
      this.messageTimeouts.delete(successId);
    }
  }

  /**
   * Dismiss warning
   */
  dismissWarning(warningId: string): void {
    const currentWarnings = this.uiState.warnings || [];
    const updatedWarnings = currentWarnings.filter(w => w.id !== warningId);
    
    this.updateUIState({
      warnings: updatedWarnings,
    });
  }

  /**
   * Update form data
   */
  updateFormData(data: Partial<AuthFormData>): void {
    this.updateUIState({
      formData: { ...this.uiState.formData, ...data },
    });

    // Clear validation errors for updated fields
    const updatedValidationErrors = { ...this.uiState.validationErrors };
    Object.keys(data).forEach(field => {
      delete updatedValidationErrors[field];
    });

    if (Object.keys(updatedValidationErrors).length !== Object.keys(this.uiState.validationErrors).length) {
      this.updateUIState({
        validationErrors: updatedValidationErrors,
      });
    }
  }

  /**
   * Validate form data
   */
  validateForm(screen?: AuthScreen): boolean {
    const targetScreen = screen || this.uiState.currentScreen;
    const rules = this.validationRules.get(targetScreen);
    
    if (!rules) {
      return true;
    }

    const validationErrors: Record<string, string> = {};
    let isValid = true;

    rules.forEach(rule => {
      const fieldValue = this.uiState.formData[rule.field];
      
      rule.rules.forEach(ruleConfig => {
        if (validationErrors[rule.field]) {
          return; // Skip if field already has an error
        }

        const isFieldValid = this.validateField(fieldValue, ruleConfig);
        if (!isFieldValid) {
          validationErrors[rule.field] = ruleConfig.message;
          isValid = false;
        }
      });
    });

    this.updateUIState({
      validationErrors,
    });

    return isValid;
  }

  /**
   * Handle authentication error
   */
  handleAuthenticationError(error: any): void {
    let uiError: Partial<UIError>;

    // Translate error to user-friendly message
    if (this.config.enableErrorTranslation) {
      uiError = this.translateError(error);
    } else {
      uiError = {
        type: 'authentication_error',
        message: error.message || 'Authentication failed',
      };
    }

    // Add appropriate actions based on error type
    uiError.actions = this.getErrorActions(uiError.type!);

    this.showError(uiError as UIError);

    // Navigate to appropriate screen if needed
    if (error.type === 'account_locked') {
      this.navigateToScreen('account_locked');
    } else if (error.type === 'session_expired') {
      this.navigateToScreen('session_expired');
    }
  }

  /**
   * Handle security warning
   */
  handleSecurityWarning(warning: any): void {
    if (!this.config.enableSecurityWarnings) {
      return;
    }

    this.showWarning({
      type: 'security_warning',
      title: 'Security Notice',
      message: this.translateSecurityWarning(warning),
      severity: warning.severity || 'warning',
      actions: this.getSecurityWarningActions(warning),
    });
  }

  /**
   * Handle session timeout warning
   */
  handleSessionTimeoutWarning(timeRemaining: number): void {
    if (!this.config.enableSessionWarnings) {
      return;
    }

    const minutes = Math.ceil(timeRemaining / (60 * 1000));
    
    this.showWarning({
      type: 'session_warning',
      title: 'Session Expiring',
      message: `Your session will expire in ${minutes} minute${minutes !== 1 ? 's' : ''}. Would you like to extend it?`,
      severity: minutes <= 2 ? 'urgent' : 'warning',
      actions: [
        {
          id: 'extend_session',
          label: 'Extend Session',
          type: 'primary',
          handler: () => this.extendSession(),
        },
        {
          id: 'sign_out',
          label: 'Sign Out',
          type: 'secondary',
          handler: () => this.signOut(),
        },
      ],
    });
  }

  /**
   * Get current UI state
   */
  getUIState(): UIState {
    return { ...this.uiState };
  }

  /**
   * Add UI state listener
   */
  addStateListener(listener: (state: UIState) => void): void {
    this.stateListeners.push(listener);
  }

  /**
   * Remove UI state listener
   */
  removeStateListener(listener: (state: UIState) => void): void {
    const index = this.stateListeners.indexOf(listener);
    if (index > -1) {
      this.stateListeners.splice(index, 1);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AuthUIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('AuthenticationUI', 'Configuration updated', {
      newConfig,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): AuthUIConfig {
    return { ...this.config };
  }

  // Private helper methods

  private updateUIState(updates: Partial<UIState>): void {
    this.uiState = { ...this.uiState, ...updates };
    
    // Notify listeners
    this.stateListeners.forEach(listener => {
      try {
        listener(this.uiState);
      } catch (error: any) {
        loggingService.error('AuthenticationUI', 'Error in state listener', {
          error: error.message,
        });
      }
    });
  }

  private canNavigateBack(currentScreen: AuthScreen, previousScreen?: AuthScreen): boolean {
    const noBackScreens: AuthScreen[] = ['login', 'loading', 'success'];
    return !noBackScreens.includes(currentScreen) && !!previousScreen;
  }

  private generateId(): string {
    return `ui_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getErrorTitle(type: UIErrorType): string {
    const titles = {
      'network_error': 'Connection Error',
      'authentication_error': 'Authentication Failed',
      'validation_error': 'Invalid Input',
      'security_error': 'Security Issue',
      'session_error': 'Session Problem',
      'service_error': 'Service Unavailable',
      'unknown_error': 'Error',
    };
    
    return titles[type] || 'Error';
  }

  private getWarningTitle(type: UIWarningType): string {
    const titles = {
      'security_warning': 'Security Notice',
      'session_warning': 'Session Warning',
      'network_warning': 'Network Notice',
      'performance_warning': 'Performance Notice',
    };
    
    return titles[type] || 'Warning';
  }

  private translateError(error: any): Partial<UIError> {
    // Map technical errors to user-friendly messages
    const errorMappings = {
      'INVALID_CREDENTIALS': {
        type: 'authentication_error' as UIErrorType,
        title: 'Login Failed',
        message: 'The email or password you entered is incorrect. Please try again.',
        actionable: true,
      },
      'ACCOUNT_LOCKED': {
        type: 'security_error' as UIErrorType,
        title: 'Account Locked',
        message: 'Your account has been temporarily locked due to multiple failed login attempts. Please try again later or contact support.',
        actionable: true,
      },
      'NETWORK_ERROR': {
        type: 'network_error' as UIErrorType,
        title: 'Connection Problem',
        message: 'Unable to connect to our servers. Please check your internet connection and try again.',
        actionable: true,
      },
      'SESSION_EXPIRED': {
        type: 'session_error' as UIErrorType,
        title: 'Session Expired',
        message: 'Your session has expired for security reasons. Please sign in again.',
        actionable: true,
      },
      'RATE_LIMITED': {
        type: 'security_error' as UIErrorType,
        title: 'Too Many Attempts',
        message: 'Too many requests. Please wait a moment before trying again.',
        actionable: false,
      },
    };

    const errorCode = error.code || error.type || 'UNKNOWN_ERROR';
    const mapping = errorMappings[errorCode as keyof typeof errorMappings];
    
    if (mapping) {
      return {
        ...mapping,
        details: this.config.showDetailedErrors ? error.message : undefined,
      };
    }

    return {
      type: 'unknown_error',
      title: 'Something went wrong',
      message: 'An unexpected error occurred. Please try again.',
      details: this.config.showDetailedErrors ? error.message : undefined,
    };
  }

  private getErrorActions(errorType: UIErrorType): UIAction[] {
    const actions: Record<UIErrorType, UIAction[]> = {
      'network_error': [
        {
          id: 'retry',
          label: 'Retry',
          type: 'primary',
          handler: () => this.retryLastAction(),
        },
      ],
      'authentication_error': [
        {
          id: 'try_again',
          label: 'Try Again',
          type: 'primary',
          handler: () => this.clearError(),
        },
        {
          id: 'forgot_password',
          label: 'Forgot Password?',
          type: 'link',
          handler: () => this.navigateToScreen('forgot_password'),
        },
      ],
      'security_error': [
        {
          id: 'contact_support',
          label: 'Contact Support',
          type: 'secondary',
          handler: () => this.contactSupport(),
        },
      ],
      'session_error': [
        {
          id: 'sign_in',
          label: 'Sign In',
          type: 'primary',
          handler: () => this.navigateToScreen('login'),
        },
      ],
      'validation_error': [],
      'service_error': [
        {
          id: 'retry',
          label: 'Retry',
          type: 'primary',
          handler: () => this.retryLastAction(),
        },
      ],
      'unknown_error': [
        {
          id: 'retry',
          label: 'Retry',
          type: 'primary',
          handler: () => this.retryLastAction(),
        },
      ],
    };

    return actions[errorType] || [];
  }

  private translateSecurityWarning(warning: any): string {
    const warningMappings = {
      'unusual_location': 'We noticed a login from an unusual location. If this was you, you can safely ignore this message.',
      'new_device': 'We detected a login from a new device. If this was you, you can safely ignore this message.',
      'suspicious_activity': 'We detected some unusual activity on your account. Please review your recent activity.',
    };

    return warningMappings[warning.type as keyof typeof warningMappings] || warning.message || 'Security notice';
  }

  private getSecurityWarningActions(warning: any): UIAction[] {
    return [
      {
        id: 'review_activity',
        label: 'Review Activity',
        type: 'primary',
        handler: () => this.reviewSecurityActivity(),
      },
      {
        id: 'dismiss',
        label: 'Dismiss',
        type: 'secondary',
        handler: () => this.dismissWarning(warning.id),
      },
    ];
  }

  private validateField(value: any, rule: any): boolean {
    switch (rule.type) {
      case 'required':
        return value !== undefined && value !== null && value !== '';
      
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return !value || emailRegex.test(value);
      
      case 'minLength':
        return !value || value.length >= rule.value;
      
      case 'maxLength':
        return !value || value.length <= rule.value;
      
      case 'pattern':
        return !value || rule.value.test(value);
      
      case 'custom':
        return !value || rule.validator(value);
      
      default:
        return true;
    }
  }

  private initializeValidationRules(): void {
    // Login screen validation
    this.validationRules.set('login', [
      {
        field: 'email',
        rules: [
          { type: 'required', message: 'Email is required' },
          { type: 'email', message: 'Please enter a valid email address' },
        ],
      },
      {
        field: 'password',
        rules: [
          { type: 'required', message: 'Password is required' },
        ],
      },
    ]);

    // Register screen validation
    this.validationRules.set('register', [
      {
        field: 'firstName',
        rules: [
          { type: 'required', message: 'First name is required' },
          { type: 'minLength', value: 2, message: 'First name must be at least 2 characters' },
        ],
      },
      {
        field: 'lastName',
        rules: [
          { type: 'required', message: 'Last name is required' },
          { type: 'minLength', value: 2, message: 'Last name must be at least 2 characters' },
        ],
      },
      {
        field: 'email',
        rules: [
          { type: 'required', message: 'Email is required' },
          { type: 'email', message: 'Please enter a valid email address' },
        ],
      },
      {
        field: 'password',
        rules: [
          { type: 'required', message: 'Password is required' },
          { type: 'minLength', value: 8, message: 'Password must be at least 8 characters' },
          { 
            type: 'pattern', 
            value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
            message: 'Password must contain uppercase, lowercase, number, and special character'
          },
        ],
      },
      {
        field: 'confirmPassword',
        rules: [
          { type: 'required', message: 'Please confirm your password' },
          { 
            type: 'custom',
            validator: (value: string) => value === this.uiState.formData.password,
            message: 'Passwords do not match'
          },
        ],
      },
    ]);

    // Reset password validation
    this.validationRules.set('reset_password', [
      {
        field: 'password',
        rules: [
          { type: 'required', message: 'New password is required' },
          { type: 'minLength', value: 8, message: 'Password must be at least 8 characters' },
        ],
      },
      {
        field: 'confirmPassword',
        rules: [
          { type: 'required', message: 'Please confirm your new password' },
          { 
            type: 'custom',
            validator: (value: string) => value === this.uiState.formData.password,
            message: 'Passwords do not match'
          },
        ],
      },
    ]);
  }

  private setupServiceListeners(): void {
    // Listen for authentication state changes
    authStateBroadcastService.addAuthStateListener((event) => {
      this.handleAuthStateChange(event);
    });

    // Listen for session timeout warnings
    sessionTimeoutService.addTimeoutEventListener((event) => {
      if (event.type === 'warning') {
        this.handleSessionTimeoutWarning(event.timeRemaining || 0);
      }
    });

    // Listen for security events
    securityMonitoringService.addSecurityEventListener((event) => {
      if (event.severity === 'high' || event.severity === 'critical') {
        this.handleSecurityWarning(event);
      }
    });
  }

  private handleAuthStateChange(event: any): void {
    switch (event.type) {
      case 'authenticated':
        this.showSuccess({
          message: 'Successfully signed in!',
        });
        this.navigateToScreen('success');
        break;
        
      case 'signed_out':
        this.navigateToScreen('login');
        this.updateUIState({
          formData: {},
          validationErrors: {},
          warnings: [],
        });
        break;
        
      case 'session_expired':
        this.handleAuthenticationError({
          type: 'SESSION_EXPIRED',
          message: 'Your session has expired',
        });
        break;
        
      case 'account_locked':
        this.handleAuthenticationError({
          type: 'ACCOUNT_LOCKED',
          message: 'Account has been locked',
        });
        break;
    }
  }

  private triggerHapticFeedback(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'): void {
    // Mock haptic feedback - would integrate with platform-specific APIs
    loggingService.debug('AuthenticationUI', 'Haptic feedback triggered', { type });
  }

  private async retryLastAction(): Promise<void> {
    // Mock retry functionality - would retry the last failed action
    this.clearError();
    this.showLoading('Retrying...');
    
    setTimeout(() => {
      this.hideLoading();
    }, 1000);
  }

  private async contactSupport(): Promise<void> {
    // Mock support contact - would open support channel
    loggingService.info('AuthenticationUI', 'Support contact requested');
  }

  private async extendSession(): Promise<void> {
    // Mock session extension - would call session service
    this.dismissWarning('session_warning');
    this.showSuccess({
      message: 'Session extended successfully',
    });
  }

  private async signOut(): Promise<void> {
    // Mock sign out - would call authentication service
    this.dismissWarning('session_warning');
    this.navigateToScreen('login');
  }

  private async reviewSecurityActivity(): Promise<void> {
    // Mock security review - would navigate to security screen
    loggingService.info('AuthenticationUI', 'Security activity review requested');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Clear all timeouts
    this.messageTimeouts.forEach(timeout => clearTimeout(timeout));
    this.messageTimeouts.clear();
    
    // Clear listeners
    this.stateListeners.length = 0;
    
    loggingService.info('AuthenticationUI', 'Authentication UI service destroyed');
  }
}

export const authenticationUIService = new AuthenticationUIService();
export type { AuthUIConfig, UIState, UIError, UISuccess, UIWarning, UIAction, AuthScreen, AuthFormData };