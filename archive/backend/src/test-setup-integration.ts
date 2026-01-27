// Configuración específica para tests de integración completa
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

// Configurar timeouts globales
jest.setTimeout(15000);

// Mock de AWS SDK para evitar llamadas reales
jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
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

// Mock específico para cron jobs - más compatible con AppModule
const originalCron = jest.requireActual('@nestjs/schedule');

// Mock solo los métodos que causan problemas, pero mantén la estructura del módulo
jest.mock('@nestjs/schedule', () => ({
  ...originalCron,
  Cron: jest.fn(() => (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    // No hacer nada, solo devolver el descriptor original
    return descriptor;
  }),
}));

// Mock de MultiTableService para EventTracker
jest.mock('../src/infrastructure/database/multi-table.service', () => ({
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