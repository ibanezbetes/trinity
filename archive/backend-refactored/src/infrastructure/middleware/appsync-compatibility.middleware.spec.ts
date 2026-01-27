import { Test, TestingModule } from '@nestjs/testing';
import { AppSyncCompatibilityMiddleware, AppSyncResponseTransformer } from './appsync-compatibility.middleware';
import { Request, Response } from 'express';

describe('AppSyncCompatibilityMiddleware', () => {
  let middleware: AppSyncCompatibilityMiddleware;
  let transformer: AppSyncResponseTransformer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppSyncCompatibilityMiddleware, AppSyncResponseTransformer],
    }).compile();

    middleware = module.get<AppSyncCompatibilityMiddleware>(AppSyncCompatibilityMiddleware);
    transformer = module.get<AppSyncResponseTransformer>(AppSyncResponseTransformer);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
    expect(transformer).toBeDefined();
  });

  it('should remove genrePreferences from createRoom input', () => {
    const mockReq = {
      body: {
        query: 'mutation createRoom($input: CreateRoomInput!) { createRoom(input: $input) { id name } }',
        variables: {
          input: {
            name: 'Test Room',
            description: 'Test Description',
            genrePreferences: ['action', 'comedy']
          }
        }
      }
    } as Request;

    const mockRes = {
      setHeader: jest.fn()
    } as unknown as Response;

    const mockNext = jest.fn();

    middleware.use(mockReq, mockRes, mockNext);

    expect(mockReq.body.variables.input.genrePreferences).toBeUndefined();
    expect(mockReq.body.variables.input.name).toBe('Test Room');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should transform createRoomDebug to createRoom', () => {
    const mockReq = {
      body: {
        query: 'mutation createRoomDebug($input: CreateRoomInputDebug!) { createRoomDebug(input: $input) { id name } }',
        variables: {
          input: {
            name: 'Debug Room'
          }
        }
      }
    } as Request;

    const mockRes = {
      setHeader: jest.fn()
    } as unknown as Response;

    const mockNext = jest.fn();

    middleware.use(mockReq, mockRes, mockNext);

    expect(mockReq.body.query).toContain('createRoom');
    expect(mockReq.body.variables.input.name).toBe('Debug Room');
    expect(mockReq.body.variables.input.description).toContain('Debug room');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should add compatibility headers', () => {
    const mockReq = {
      body: {
        query: 'query getUserRooms { getUserRooms { id name } }',
        variables: {}
      }
    } as Request;

    const mockRes = {
      setHeader: jest.fn()
    } as unknown as Response;

    const mockNext = jest.fn();

    middleware.use(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Trinity-Compatibility', 'enabled');
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Trinity-Version', '2.0.0');
    expect(mockNext).toHaveBeenCalled();
  });
});