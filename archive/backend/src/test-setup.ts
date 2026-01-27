// Configuración global para tests
import { ConfigService } from '@nestjs/config';

// Mock de variables de entorno para tests
process.env.NODE_ENV = 'test';
process.env.COGNITO_USER_POOL_ID = 'us-east-1_ABCDEFGHI';
process.env.COGNITO_CLIENT_ID = '1234567890abcdefghijklmnop';
process.env.COGNITO_REGION = 'us-east-1';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.DYNAMODB_TABLE_NAME = 'trinity-test';
process.env.TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.COGNITO_IDENTITY_POOL_ID = 'us-east-1:12345678-1234-1234-1234-123456789012';
process.env.COGNITO_GOOGLE_PROVIDER_NAME = 'accounts.google.com';
process.env.COGNITO_FEDERATED_IDENTITY_ENABLED = 'false';
process.env.APPSYNC_API_KEY = 'test-appsync-api-key';

// Configurar timeouts globales
jest.setTimeout(15000);

// Mock de @nestjs/schedule para evitar problemas con cron jobs en tests
jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: {
    forRoot: jest.fn(() => ({
      module: 'MockScheduleModule',
      providers: [],
      exports: [],
    })),
  },
  Cron: jest.fn(() => jest.fn()),
  CronExpression: {
    EVERY_5_MINUTES: '*/5 * * * *',
    EVERY_10_MINUTES: '*/10 * * * *',
    EVERY_15_MINUTES: '*/15 * * * *',
    EVERY_HOUR: '0 * * * *',
    EVERY_DAY_AT_9AM: '0 9 * * *',
    EVERY_SUNDAY_AT_2AM: '0 2 * * 0',
  },
}));

// Mock de AWS SDK para evitar llamadas reales
jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  CognitoIdentity: jest.fn().mockImplementation(() => ({
    getId: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        IdentityId: 'mock-identity-id',
      }),
    }),
    getCredentialsForIdentity: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Credentials: {
          AccessKeyId: 'mock-access-key',
          SecretKey: 'mock-secret-key',
          SessionToken: 'mock-session-token',
        },
      }),
    }),
  })),
  CognitoIdentityServiceProvider: jest.fn().mockImplementation(() => ({
    adminCreateUser: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        User: { Username: 'test-user' },
      }),
    }),
    adminSetUserPassword: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
    adminInitiateAuth: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
        },
      }),
    }),
    adminGetUser: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        UserAttributes: [
          { Name: 'email', Value: 'test@example.com' },
          { Name: 'preferred_username', Value: 'testuser' },
          { Name: 'email_verified', Value: 'true' },
        ],
      }),
    }),
    confirmSignUp: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
    resendConfirmationCode: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
    forgotPassword: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
    confirmForgotPassword: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
    adminDeleteUser: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Item: {} }),
      }),
      put: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      }),
      update: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      }),
      delete: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      }),
      query: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Items: [] }),
      }),
      scan: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Items: [] }),
      }),
      batchGet: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Responses: {} }),
      }),
      batchWrite: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      }),
    })),
  },
}));

// Mock de aws-jwt-verify
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn().mockReturnValue({
      verify: jest.fn().mockResolvedValue({
        sub: 'mock-user-sub',
        username: 'testuser',
        email: 'test@example.com',
      }),
    }),
  },
}));

// Mock de axios para llamadas HTTP externas
jest.mock('axios', () => ({
  default: {
    create: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({ data: {} }),
      post: jest.fn().mockResolvedValue({ data: {} }),
      put: jest.fn().mockResolvedValue({ data: {} }),
      delete: jest.fn().mockResolvedValue({ data: {} }),
      interceptors: {
        request: {
          use: jest.fn(),
        },
        response: {
          use: jest.fn(),
        },
      },
    })),
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: {
        use: jest.fn(),
      },
      response: {
        use: jest.fn(),
      },
    },
  },
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: {
        use: jest.fn(),
      },
      response: {
        use: jest.fn(),
      },
    },
  })),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
  delete: jest.fn().mockResolvedValue({ data: {} }),
  interceptors: {
    request: {
      use: jest.fn(),
    },
    response: {
      use: jest.fn(),
    },
  },
}));
// Mock de MultiTableService para EventTracker
jest.mock('./infrastructure/database/multi-table.service', () => ({
  MultiTableService: jest.fn().mockImplementation(() => ({
    putItem: jest.fn().mockResolvedValue({}),
    getItem: jest.fn().mockResolvedValue(null),
    query: jest.fn().mockResolvedValue([]),
    updateItem: jest.fn().mockResolvedValue({}),
    deleteItem: jest.fn().mockResolvedValue({}),
    batchWrite: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
  })),
  create: jest.fn().mockReturnValue({
    putItem: jest.fn().mockResolvedValue({}),
    getItem: jest.fn().mockResolvedValue(null),
    query: jest.fn().mockResolvedValue([]),
    updateItem: jest.fn().mockResolvedValue({}),
    deleteItem: jest.fn().mockResolvedValue({}),
    batchWrite: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
  }),
}));

// Mock de EventTracker
jest.mock('./modules/analytics/event-tracker.service', () => ({
  EventTracker: jest.fn().mockImplementation(() => ({
    trackEvent: jest.fn().mockResolvedValue(undefined),
    trackUserEvent: jest.fn().mockResolvedValue(undefined),
    trackRoomEvent: jest.fn().mockResolvedValue(undefined),
    trackContentEvent: jest.fn().mockResolvedValue(undefined),
    trackSystemEvent: jest.fn().mockResolvedValue(undefined),
    trackContentInteraction: jest.fn().mockResolvedValue(undefined),
    trackUserAction: jest.fn().mockResolvedValue(undefined),
    trackAIEvent: jest.fn().mockResolvedValue(undefined),
    batchTrackEvents: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock de RealtimeCompatibilityService
jest.mock('./modules/realtime/realtime-compatibility.service', () => ({
  RealtimeCompatibilityService: jest.fn().mockImplementation(() => ({
    notifyThemeChange: jest.fn().mockResolvedValue(undefined),
    notifyThemeApplication: jest.fn().mockResolvedValue(undefined),
    notifyThemeRating: jest.fn().mockResolvedValue(undefined),
    notifyScheduleChange: jest.fn().mockResolvedValue(undefined),
    notifyModerationAction: jest.fn().mockResolvedValue(undefined),
    notifyRoleAssignment: jest.fn().mockResolvedValue(undefined),
    notifyConfigurationChange: jest.fn().mockResolvedValue(undefined),
    notifyVote: jest.fn().mockResolvedValue(undefined),
    notifyMatch: jest.fn().mockResolvedValue(undefined),
    notifyRoomStateChange: jest.fn().mockResolvedValue(undefined),
    notifyMemberStatusChange: jest.fn().mockResolvedValue(undefined),
    notifyQueueProgress: jest.fn().mockResolvedValue(undefined),
    notifyAIRecommendation: jest.fn().mockResolvedValue(undefined),
    notifyScheduleEvent: jest.fn().mockResolvedValue(undefined),
    notifyRoomSettingsChange: jest.fn().mockResolvedValue(undefined),
    notifyChatMessage: jest.fn().mockResolvedValue(undefined),
    notifyContentSuggestion: jest.fn().mockResolvedValue(undefined),
    notifyAutomationAction: jest.fn().mockResolvedValue(undefined),
    notifyOptimizationResult: jest.fn().mockResolvedValue(undefined),
    getRealtimeStats: jest.fn().mockReturnValue({
      type: 'AppSync',
      apiUrl: 'mock-url',
      connections: 0,
    }),
    getConnectedMembers: jest.fn().mockReturnValue([]),
    isUserConnected: jest.fn().mockReturnValue(false),
    broadcastSystemMessage: jest.fn().mockResolvedValue(undefined),
    sendPrivateMessage: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
}));