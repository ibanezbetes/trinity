/**
 * Dual Error Logging Service
 * Handles comprehensive error logging with data sanitization and dual logging system:
 * - Detailed error logging for debugging purposes
 * - User-friendly error messages separate from debug logs
 * - Ensures sensitive data (passwords, tokens) is never logged in plain text
 */

type LogLevelType = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogLevel {
  DEBUG: 'debug';
  INFO: 'info';
  WARN: 'warn';
  ERROR: 'error';
  FATAL: 'fatal';
}

interface LogEntry {
  timestamp: string;
  level: LogLevelType;
  category: string;
  message: string;
  data?: any;
  userId?: string;
  sessionId?: string;
  buildVersion?: string;
  platform?: string;
  userFriendlyMessage?: string; // Dual logging: user-friendly version
  technicalDetails?: any; // Dual logging: technical details for debugging
  sanitized: boolean; // Indicates if sensitive data was removed
}

interface DualLogConfig {
  enableUserFriendlyMessages: boolean;
  enableTechnicalLogging: boolean;
  separateUserLogs: boolean;
  maxUserMessageLength: number;
  maxTechnicalDataSize: number;
  sanitizeSensitiveData: boolean;
  logToConsole: boolean;
  logToStorage: boolean;
}

interface UserFriendlyLog {
  timestamp: string;
  level: LogLevelType;
  category: string;
  userMessage: string;
  guidance?: string;
  sessionId: string;
}

interface SensitiveDataPattern {
  pattern: RegExp;
  replacement: string;
  description: string;
}

class DualLoggingService {
  private readonly LOG_LEVELS: LogLevel = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'fatal'
  };

  private readonly MAX_LOG_ENTRIES = 1000;
  private readonly MAX_MESSAGE_LENGTH = 2000;
  private readonly MAX_DATA_SIZE = 10000; // characters
  private readonly MAX_USER_LOGS = 500; // Separate limit for user-friendly logs

  private config: DualLogConfig = {
    enableUserFriendlyMessages: true,
    enableTechnicalLogging: true,
    separateUserLogs: true,
    maxUserMessageLength: 200,
    maxTechnicalDataSize: 10000,
    sanitizeSensitiveData: true,
    logToConsole: true,
    logToStorage: true,
  };

  private logEntries: LogEntry[] = [];
  private userFriendlyLogs: UserFriendlyLog[] = []; // Separate user-friendly log storage
  private sessionId: string;
  private userId?: string;

  // Enhanced sensitive data patterns for dual logging
  private readonly SENSITIVE_PATTERNS: SensitiveDataPattern[] = [
    {
      pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
      replacement: 'Bearer [REDACTED_TOKEN]',
      description: 'Bearer tokens'
    },
    {
      pattern: /"accessToken"\s*:\s*"[^"]+"/gi,
      replacement: '"accessToken": "[REDACTED]"',
      description: 'Access tokens in JSON'
    },
    {
      pattern: /"idToken"\s*:\s*"[^"]+"/gi,
      replacement: '"idToken": "[REDACTED]"',
      description: 'ID tokens in JSON'
    },
    {
      pattern: /"refreshToken"\s*:\s*"[^"]+"/gi,
      replacement: '"refreshToken": "[REDACTED]"',
      description: 'Refresh tokens in JSON'
    },
    {
      pattern: /"password"\s*:\s*"[^"]+"/gi,
      replacement: '"password": "[REDACTED]"',
      description: 'Passwords in JSON'
    },
    {
      pattern: /password[=:]\s*[^\s&]+/gi,
      replacement: 'password=[REDACTED]',
      description: 'Password parameters'
    },
    {
      pattern: /Authorization:\s*[^\r\n]+/gi,
      replacement: 'Authorization: [REDACTED]',
      description: 'Authorization headers'
    },
    {
      pattern: /X-Amz-Security-Token:\s*[^\r\n]+/gi,
      replacement: 'X-Amz-Security-Token: [REDACTED]',
      description: 'AWS security tokens'
    },
    {
      pattern: /api[_-]?key[=:]\s*[^\s&]+/gi,
      replacement: 'api_key=[REDACTED]',
      description: 'API keys'
    },
    {
      pattern: /secret[=:]\s*[^\s&]+/gi,
      replacement: 'secret=[REDACTED]',
      description: 'Secret values'
    },
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replacement: '[EMAIL_REDACTED]',
      description: 'Email addresses'
    },
    {
      pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      replacement: '[CARD_NUMBER_REDACTED]',
      description: 'Credit card numbers'
    },
    {
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: '[SSN_REDACTED]',
      description: 'Social Security Numbers'
    },
    // Additional patterns for enhanced security
    {
      pattern: /"sub"\s*:\s*"[^"]+"/gi,
      replacement: '"sub": "[USER_ID_REDACTED]"',
      description: 'User IDs in JWT'
    },
    {
      pattern: /client[_-]?secret[=:]\s*[^\s&]+/gi,
      replacement: 'client_secret=[REDACTED]',
      description: 'Client secrets'
    },
    {
      pattern: /private[_-]?key[=:]\s*[^\s&]+/gi,
      replacement: 'private_key=[REDACTED]',
      description: 'Private keys'
    },
  ];

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeLogging();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${timestamp}-${random}`;
  }

  /**
   * Initialize logging system with dual logging capabilities
   */
  private initializeLogging(): void {
    // Set up global error handlers (only in web environments)
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('error', (event) => {
        this.logDualError('Global Error', event.error?.message || 'Unknown error', {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack
        }, 'Ocurrió un error inesperado en la aplicación.');
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.logDualError('Unhandled Promise Rejection', event.reason?.message || 'Unknown rejection', {
          reason: event.reason,
          stack: event.reason?.stack
        }, 'Error de conexión inesperado.');
      });
    }

    this.info('Dual Logging Service', 'Dual logging system initialized', {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      config: this.config,
    });
  }

  /**
   * Update dual logging configuration
   */
  updateConfig(newConfig: Partial<DualLogConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    this.info('Dual Logging Service', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): DualLogConfig {
    return { ...this.config };
  }

  /**
   * Set current user ID for logging context
   */
  setUserId(userId: string): void {
    const sanitized = this.sanitizeString(userId);
    this.userId = sanitized.sanitized;
    this.info('Logging Service', 'User context updated');
  }

  /**
   * Clear user context
   */
  clearUserId(): void {
    this.userId = undefined;
    this.info('Logging Service', 'User context cleared');
  }

  /**
   * Detect if input contains sensitive data
   */
  private containsSensitiveData(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    return this.SENSITIVE_PATTERNS.some(pattern => pattern.pattern.test(input));
  }

  /**
   * Sanitize sensitive data from strings with detection
   */
  private sanitizeString(input: string): { sanitized: string; hadSensitiveData: boolean } {
    if (!input || typeof input !== 'string') {
      return { sanitized: input, hadSensitiveData: false };
    }

    let sanitized = input;
    let hadSensitiveData = false;

    // Apply all sensitive data patterns
    this.SENSITIVE_PATTERNS.forEach(pattern => {
      if (pattern.pattern.test(sanitized)) {
        hadSensitiveData = true;
        sanitized = sanitized.replace(pattern.pattern, pattern.replacement);
      }
    });

    return { sanitized, hadSensitiveData };
  }

  /**
   * Sanitize sensitive data from objects with detection
   */
  private sanitizeData(data: any): { sanitized: any; hadSensitiveData: boolean } {
    if (!data) return { sanitized: data, hadSensitiveData: false };

    try {
      // Convert to string and sanitize
      const jsonString = JSON.stringify(data, null, 2);
      const { sanitized: sanitizedString, hadSensitiveData } = this.sanitizeString(jsonString);
      
      // Try to parse back to object
      try {
        return { sanitized: JSON.parse(sanitizedString), hadSensitiveData };
      } catch {
        // If parsing fails, return sanitized string
        return { sanitized: sanitizedString, hadSensitiveData };
      }
    } catch (error) {
      // If JSON.stringify fails, return safe representation
      return { sanitized: '[COMPLEX_OBJECT_REDACTED]', hadSensitiveData: true };
    }
  }

  /**
   * Truncate user message for user-friendly logs
   */
  private truncateUserMessage(message: string): string {
    if (message.length <= this.config.maxUserMessageLength) {
      return message;
    }

    return message.substring(0, this.config.maxUserMessageLength - 15) + '...[MÁS INFO]';
  }

  /**
   * Truncate technical data
   */
  private truncateTechnicalData(data: any): any {
    if (!data) return data;

    try {
      const dataString = JSON.stringify(data);
      if (dataString.length <= this.config.maxTechnicalDataSize) {
        return data;
      }

      // If too large, return truncated version
      const truncated = dataString.substring(0, this.config.maxTechnicalDataSize - 50);
      return `${truncated}...[TECHNICAL_DATA_TRUNCATED]`;
    } catch {
      return '[LARGE_TECHNICAL_DATA_REDACTED]';
    }
  }

  /**
   * Create dual log entry (technical + user-friendly)
   */
  private createDualLogEntry(
    level: LogLevelType,
    category: string,
    message: string,
    data?: any,
    userFriendlyMessage?: string,
    guidance?: string
  ): LogEntry {
    // Sanitize technical data
    const { sanitized: sanitizedMessage, hadSensitiveData: messageSensitive } = 
      this.config.sanitizeSensitiveData ? this.sanitizeString(message) : { sanitized: message, hadSensitiveData: false };
    
    const { sanitized: sanitizedData, hadSensitiveData: dataSensitive } = 
      this.config.sanitizeSensitiveData && data ? this.sanitizeData(data) : { sanitized: data, hadSensitiveData: false };

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: category,
      message: this.truncateMessage(sanitizedMessage),
      sessionId: this.sessionId,
      buildVersion: '1.0.0',
      platform: 'mobile',
      sanitized: messageSensitive || dataSensitive,
    };

    if (this.userId) {
      entry.userId = this.userId;
    }

    // Add technical details if enabled
    if (this.config.enableTechnicalLogging && sanitizedData) {
      entry.technicalDetails = this.truncateTechnicalData(sanitizedData);
    }

    // Add user-friendly message if provided and enabled
    if (this.config.enableUserFriendlyMessages && userFriendlyMessage) {
      entry.userFriendlyMessage = this.truncateUserMessage(userFriendlyMessage);
    }

    // Store data for technical logging
    if (this.config.enableTechnicalLogging && sanitizedData) {
      entry.data = this.truncateTechnicalData(sanitizedData);
    }

    return entry;
  }

  /**
   * Create user-friendly log entry
   */
  private createUserFriendlyLogEntry(
    level: LogLevelType,
    category: string,
    userMessage: string,
    guidance?: string
  ): UserFriendlyLog {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      userMessage: this.truncateUserMessage(userMessage),
      guidance: guidance ? this.truncateUserMessage(guidance) : undefined,
      sessionId: this.sessionId,
    };
  }

  /**
   * Add log entry to appropriate storage
   */
  private addDualLogEntry(entry: LogEntry, userFriendlyEntry?: UserFriendlyLog): void {
    // Add to technical logs if enabled
    if (this.config.enableTechnicalLogging && this.config.logToStorage) {
      this.logEntries.push(entry);

      // Maintain max log entries limit
      if (this.logEntries.length > this.MAX_LOG_ENTRIES) {
        this.logEntries = this.logEntries.slice(-this.MAX_LOG_ENTRIES);
      }
    }

    // Add to user-friendly logs if enabled and separate storage is configured
    if (this.config.enableUserFriendlyMessages && this.config.separateUserLogs && userFriendlyEntry) {
      this.userFriendlyLogs.push(userFriendlyEntry);

      // Maintain max user log entries limit
      if (this.userFriendlyLogs.length > this.MAX_USER_LOGS) {
        this.userFriendlyLogs = this.userFriendlyLogs.slice(-this.MAX_USER_LOGS);
      }
    }

    // Output to console if enabled
    if (this.config.logToConsole && __DEV__) {
      const consoleMethod = this.getConsoleMethod(entry.level);
      
      if (this.config.enableUserFriendlyMessages && entry.userFriendlyMessage) {
        // Show both technical and user-friendly in development
        consoleMethod(
          `[${entry.level.toUpperCase()}] ${entry.category}:\n` +
          `  Technical: ${entry.message}\n` +
          `  User-Friendly: ${entry.userFriendlyMessage}`,
          entry.data
        );
      } else {
        consoleMethod(`[${entry.level.toUpperCase()}] ${entry.category}: ${entry.message}`, entry.data);
      }
    }
  }

  /**
   * Dual error logging - logs both technical details and user-friendly message
   */
  logDualError(
    category: string,
    technicalMessage: string,
    technicalData?: any,
    userFriendlyMessage?: string,
    guidance?: string
  ): void {
    const entry = this.createDualLogEntry(
      'error',
      category,
      technicalMessage,
      technicalData,
      userFriendlyMessage,
      guidance
    );

    let userEntry: UserFriendlyLog | undefined;
    if (userFriendlyMessage) {
      userEntry = this.createUserFriendlyLogEntry('error', category, userFriendlyMessage, guidance);
    }

    this.addDualLogEntry(entry, userEntry);
  }

  /**
   * Dual warning logging
   */
  logDualWarning(
    category: string,
    technicalMessage: string,
    technicalData?: any,
    userFriendlyMessage?: string,
    guidance?: string
  ): void {
    const entry = this.createDualLogEntry(
      'warn',
      category,
      technicalMessage,
      technicalData,
      userFriendlyMessage,
      guidance
    );

    let userEntry: UserFriendlyLog | undefined;
    if (userFriendlyMessage) {
      userEntry = this.createUserFriendlyLogEntry('warn', category, userFriendlyMessage, guidance);
    }

    this.addDualLogEntry(entry, userEntry);
  }

  /**
   * Dual info logging
   */
  logDualInfo(
    category: string,
    technicalMessage: string,
    technicalData?: any,
    userFriendlyMessage?: string,
    guidance?: string
  ): void {
    const entry = this.createDualLogEntry(
      'info',
      category,
      technicalMessage,
      technicalData,
      userFriendlyMessage,
      guidance
    );

    let userEntry: UserFriendlyLog | undefined;
    if (userFriendlyMessage) {
      userEntry = this.createUserFriendlyLogEntry('info', category, userFriendlyMessage, guidance);
    }

    this.addDualLogEntry(entry, userEntry);
  }

  /**
   * Get appropriate console method for log level
   */
  private getConsoleMethod(level: LogLevelType): (...args: any[]) => void {
    switch (level) {
      case 'debug':
        return console.debug;
      case 'info':
        return console.info;
      case 'warn':
        return console.warn;
      case 'error':
      case 'fatal':
        return console.error;
      default:
        return console.log;
    }
  }

  /**
   * Debug level logging (backward compatible)
   */
  debug(category: string, message: string, data?: any): void {
    const entry = this.createDualLogEntry('debug', category, message, data);
    this.addDualLogEntry(entry);
  }

  /**
   * Info level logging (backward compatible)
   */
  info(category: string, message: string, data?: any): void {
    const entry = this.createDualLogEntry('info', category, message, data);
    this.addDualLogEntry(entry);
  }

  /**
   * Warning level logging (backward compatible)
   */
  warn(category: string, message: string, data?: any): void {
    const entry = this.createDualLogEntry('warn', category, message, data);
    this.addDualLogEntry(entry);
  }

  /**
   * Error level logging (backward compatible)
   */
  error(category: string, message: string, data?: any): void {
    const entry = this.createDualLogEntry('error', category, message, data);
    this.addDualLogEntry(entry);
  }

  /**
   * Fatal level logging (backward compatible)
   */
  fatal(category: string, message: string, data?: any): void {
    const entry = this.createDualLogEntry('fatal', category, message, data);
    this.addDualLogEntry(entry);
  }

  /**
   * Log authentication events
   */
  logAuth(event: 'login' | 'logout' | 'register' | 'token_refresh' | 'auth_error', data?: any): void {
    this.info('Authentication', `Auth event: ${event}`, data);
  }

  /**
   * Log network events
   */
  logNetwork(event: 'request' | 'response' | 'error' | 'retry' | 'timeout', data?: any): void {
    this.info('Network', `Network event: ${event}`, data);
  }

  /**
   * Log GraphQL events
   */
  logGraphQL(event: 'query' | 'mutation' | 'subscription' | 'error', data?: any): void {
    this.info('GraphQL', `GraphQL event: ${event}`, data);
  }

  /**
   * Log real-time events
   */
  logRealtime(event: 'connect' | 'disconnect' | 'message' | 'error' | 'reconnect', data?: any): void {
    this.info('Realtime', `Realtime event: ${event}`, data);
  }

  /**
   * Log migration events
   */
  logMigration(event: 'start' | 'complete' | 'error' | 'cleanup', data?: any): void {
    this.info('Migration', `Migration event: ${event}`, data);
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count: number = 100, level?: LogLevelType): LogEntry[] {
    let logs = this.logEntries;

    if (level) {
      logs = logs.filter(entry => entry.level === level);
    }

    return logs.slice(-count);
  }

  /**
   * Get logs by category
   */
  getLogsByCategory(category: string, count: number = 100): LogEntry[] {
    const categoryLogs = this.logEntries.filter(entry => 
      entry.category.toLowerCase().includes(category.toLowerCase())
    );

    return categoryLogs.slice(-count);
  }

  /**
   * Get error logs for debugging
   */
  getErrorLogs(count: number = 50): LogEntry[] {
    const errorLogs = this.logEntries.filter(entry => 
      entry.level === 'error' || entry.level === 'fatal'
    );

    return errorLogs.slice(-count);
  }

  /**
   * Export logs for debugging (sanitized)
   */
  exportLogs(): {
    sessionId: string;
    exportTime: string;
    totalEntries: number;
    logs: LogEntry[];
  } {
    return {
      sessionId: this.sessionId,
      exportTime: new Date().toISOString(),
      totalEntries: this.logEntries.length,
      logs: this.logEntries
    };
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logEntries = [];
    this.info('Logging Service', 'All logs cleared');
  }

  /**
   * Get logging statistics
   */
  getStats(): {
    totalEntries: number;
    entriesByLevel: Record<string, number>;
    entriesByCategory: Record<string, number>;
    sessionId: string;
    userId?: string;
    oldestEntry?: string;
    newestEntry?: string;
  } {
    const entriesByLevel: Record<string, number> = {};
    const entriesByCategory: Record<string, number> = {};

    this.logEntries.forEach(entry => {
      // Count by level
      entriesByLevel[entry.level] = (entriesByLevel[entry.level] || 0) + 1;
      
      // Count by category
      entriesByCategory[entry.category] = (entriesByCategory[entry.category] || 0) + 1;
    });

    return {
      totalEntries: this.logEntries.length,
      entriesByLevel,
      entriesByCategory,
      sessionId: this.sessionId,
      userId: this.userId,
      oldestEntry: this.logEntries[0]?.timestamp,
      newestEntry: this.logEntries[this.logEntries.length - 1]?.timestamp
    };
  }

  /**
   * Truncate message for logging
   */
  private truncateMessage(message: string): string {
    if (message.length <= this.MAX_MESSAGE_LENGTH) {
      return message;
    }
    return message.substring(0, this.MAX_MESSAGE_LENGTH - 15) + '...[TRUNCATED]';
  }

  /**
   * Get user-friendly logs (separate from technical logs)
   */
  getUserFriendlyLogs(count: number = 50): UserFriendlyLog[] {
    return this.userFriendlyLogs.slice(-count);
  }

  /**
   * Get technical logs (detailed debugging information)
   */
  getTechnicalLogs(count: number = 100, level?: LogLevelType): LogEntry[] {
    return this.getRecentLogs(count, level);
  }

  /**
   * Clear user-friendly logs
   */
  clearUserFriendlyLogs(): void {
    this.userFriendlyLogs = [];
    this.info('Dual Logging Service', 'User-friendly logs cleared');
  }

  /**
   * Get dual logging statistics
   */
  getDualLoggingStats(): {
    technicalLogs: number;
    userFriendlyLogs: number;
    config: DualLogConfig;
    sessionId: string;
    userId?: string;
  } {
    return {
      technicalLogs: this.logEntries.length,
      userFriendlyLogs: this.userFriendlyLogs.length,
      config: this.config,
      sessionId: this.sessionId,
      userId: this.userId,
    };
  }

  /**
   * Export dual logs for debugging
   */
  exportDualLogs(): {
    sessionId: string;
    exportTime: string;
    technicalLogs: LogEntry[];
    userFriendlyLogs: UserFriendlyLog[];
    config: DualLogConfig;
  } {
    return {
      sessionId: this.sessionId,
      exportTime: new Date().toISOString(),
      technicalLogs: this.logEntries,
      userFriendlyLogs: this.userFriendlyLogs,
      config: this.config,
    };
  }

  /**
   * Test sensitive data sanitization (for debugging)
   */
  testSanitization(input: string): { sanitized: string; hadSensitiveData: boolean } {
    return this.sanitizeString(input);
  }
}

export const loggingService = new DualLoggingService();
export default loggingService;