import { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

/**
 * Simplified Auth Handler
 * 
 * Maneja todas las operaciones de autenticación y gestión de usuarios
 * usando la tabla Core consolidada y Cognito existente.
 * 
 * **Valida: Requirements 4.4**
 */

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const CORE_TABLE = process.env.CORE_TABLE!;
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE!;

interface User {
  id: string;
  email: string;
  displayName?: string;
  profilePicture?: string;
  isActive: boolean;
  preferences?: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

interface UserPreferences {
  favoriteGenres?: string[];
  language?: string;
  notifications?: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
}

/**
 * Main Lambda handler for auth operations
 */
export const handler: AppSyncResolverHandler<any, any> = async (event) => {
  console.log('🔐 Auth Handler - Event:', JSON.stringify(event, null, 2));

  try {
    const { fieldName, arguments: args, identity } = event;

    // Extract user ID from Cognito identity
    const userId = identity?.sub || identity?.claims?.sub;
    
    if (!userId && fieldName !== 'createUser') {
      throw new Error('User not authenticated');
    }

    switch (fieldName) {
      case 'getUser':
        return await getUser(args.userId || userId);
      
      case 'createUser':
        return await createUser(args.input, userId);
      
      case 'updateUser':
        return await updateUser(args.input, userId);
      
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error: any) {
    console.error('❌ Auth Handler Error:', error);
    
    // Log error for analytics
    await logAnalyticsEvent('auth_error', {
      error: error.message,
      fieldName: event.fieldName,
      userId: event.identity?.sub
    });
    
    throw error;
  }
};

/**
 * Get user by ID
 */
async function getUser(userId: string): Promise<User | null> {
  console.log('👤 Getting user:', userId);

  try {
    const result = await docClient.send(new GetCommand({
      TableName: CORE_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      }
    }));

    if (!result.Item) {
      console.log('👤 User not found in database, checking Cognito...');
      
      // Try to get user from Cognito and create profile
      try {
        const cognitoUser = await getCognitoUser(userId);
        if (cognitoUser) {
          return await createUserFromCognito(cognitoUser, userId);
        }
      } catch (cognitoError) {
        console.warn('⚠️ Could not fetch from Cognito:', cognitoError);
      }
      
      return null;
    }

    // Convert DynamoDB item to User format
    const user: User = {
      id: result.Item.UserId,
      email: result.Item.Email,
      displayName: result.Item.DisplayName,
      profilePicture: result.Item.ProfilePicture,
      isActive: result.Item.IsActive ?? true,
      preferences: result.Item.Preferences,
      createdAt: result.Item.CreatedAt,
      updatedAt: result.Item.UpdatedAt
    };

    console.log('✅ User found:', user.id);
    return user;

  } catch (error: any) {
    console.error('❌ Error getting user:', error);
    throw new Error(`Failed to get user: ${error.message}`);
  }
}

/**
 * Create new user
 */
async function createUser(input: any, userId: string): Promise<User> {
  console.log('👤 Creating user:', userId, input);

  const now = new Date().toISOString();
  
  const user: User = {
    id: userId,
    email: input.email,
    displayName: input.displayName || input.email.split('@')[0],
    profilePicture: input.profilePicture,
    isActive: true,
    preferences: input.preferences || {
      favoriteGenres: [],
      language: 'en',
      notifications: {
        email: true,
        push: true,
        inApp: true
      }
    },
    createdAt: now,
    updatedAt: now
  };

  try {
    // Store in Core table
    await docClient.send(new PutCommand({
      TableName: CORE_TABLE,
      Item: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
        UserId: user.id,
        Email: user.email,
        DisplayName: user.displayName,
        ProfilePicture: user.profilePicture,
        IsActive: user.isActive,
        Preferences: user.preferences,
        CreatedAt: user.createdAt,
        UpdatedAt: user.updatedAt,
        EntityType: 'USER'
      },
      ConditionExpression: 'attribute_not_exists(PK)' // Prevent duplicates
    }));

    // Log analytics event
    await logAnalyticsEvent('user_created', {
      userId: user.id,
      email: user.email,
      hasDisplayName: !!user.displayName,
      hasProfilePicture: !!user.profilePicture
    });

    console.log('✅ User created successfully:', user.id);
    return user;

  } catch (error: any) {
    console.error('❌ Error creating user:', error);
    
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('User already exists');
    }
    
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

/**
 * Update existing user
 */
async function updateUser(input: any, userId: string): Promise<User> {
  console.log('👤 Updating user:', userId, input);

  const now = new Date().toISOString();

  try {
    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (input.displayName !== undefined) {
      updateExpressions.push('#displayName = :displayName');
      expressionAttributeNames['#displayName'] = 'DisplayName';
      expressionAttributeValues[':displayName'] = input.displayName;
    }

    if (input.profilePicture !== undefined) {
      updateExpressions.push('#profilePicture = :profilePicture');
      expressionAttributeNames['#profilePicture'] = 'ProfilePicture';
      expressionAttributeValues[':profilePicture'] = input.profilePicture;
    }

    if (input.preferences !== undefined) {
      updateExpressions.push('#preferences = :preferences');
      expressionAttributeNames['#preferences'] = 'Preferences';
      expressionAttributeValues[':preferences'] = input.preferences;
    }

    // Always update timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
    expressionAttributeValues[':updatedAt'] = now;

    const result = await docClient.send(new UpdateCommand({
      TableName: CORE_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
      ConditionExpression: 'attribute_exists(PK)' // Ensure user exists
    }));

    if (!result.Attributes) {
      throw new Error('User not found');
    }

    // Convert back to User format
    const updatedUser: User = {
      id: result.Attributes.UserId,
      email: result.Attributes.Email,
      displayName: result.Attributes.DisplayName,
      profilePicture: result.Attributes.ProfilePicture,
      isActive: result.Attributes.IsActive,
      preferences: result.Attributes.Preferences,
      createdAt: result.Attributes.CreatedAt,
      updatedAt: result.Attributes.UpdatedAt
    };

    // Log analytics event
    await logAnalyticsEvent('user_updated', {
      userId: updatedUser.id,
      fieldsUpdated: Object.keys(input),
      hasDisplayName: !!updatedUser.displayName,
      hasProfilePicture: !!updatedUser.profilePicture
    });

    console.log('✅ User updated successfully:', updatedUser.id);
    return updatedUser;

  } catch (error: any) {
    console.error('❌ Error updating user:', error);
    
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('User not found');
    }
    
    throw new Error(`Failed to update user: ${error.message}`);
  }
}

/**
 * Get user from Cognito
 */
async function getCognitoUser(userId: string): Promise<any> {
  try {
    // Note: This requires the access token, which we might not have in AppSync context
    // This is a fallback method that might need adjustment based on actual Cognito setup
    console.log('🔍 Attempting to fetch user from Cognito:', userId);
    
    // In a real implementation, you might need to use AdminGetUser instead
    // or handle this differently based on your Cognito setup
    return null;
    
  } catch (error) {
    console.warn('⚠️ Could not fetch user from Cognito:', error);
    return null;
  }
}

/**
 * Create user from Cognito data
 */
async function createUserFromCognito(cognitoUser: any, userId: string): Promise<User> {
  console.log('👤 Creating user from Cognito data:', userId);

  const email = cognitoUser.email || `${userId}@unknown.com`;
  const displayName = cognitoUser.name || cognitoUser.given_name || email.split('@')[0];

  const input = {
    email,
    displayName,
    profilePicture: cognitoUser.picture,
    preferences: {
      favoriteGenres: [],
      language: 'en',
      notifications: {
        email: true,
        push: true,
        inApp: true
      }
    }
  };

  return await createUser(input, userId);
}

/**
 * Log analytics event
 */
async function logAnalyticsEvent(eventType: string, data: any): Promise<void> {
  try {
    const timestamp = Date.now();
    
    await docClient.send(new PutCommand({
      TableName: ANALYTICS_TABLE,
      Item: {
        MetricType: `auth_${eventType}`,
        Timestamp: timestamp,
        Data: data,
        ExpiresAt: Math.floor(timestamp / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
      }
    }));
  } catch (error) {
    console.warn('⚠️ Failed to log analytics event:', error);
    // Don't throw - analytics failures shouldn't break the main operation
  }
}