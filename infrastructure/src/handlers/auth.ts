import { PostConfirmationTriggerEvent, PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * AuthHandler: Post Confirmation Trigger
 * Se ejecuta automáticamente después de que un usuario confirme su registro
 * Crea el perfil del usuario en la tabla UsersTable
 */
export const handler: PostConfirmationTriggerHandler = async (event: PostConfirmationTriggerEvent) => {
  console.log('🔐 Post Confirmation Trigger:', JSON.stringify(event, null, 2));

  try {
    const { userAttributes } = event.request;
    const userName = event.userName;
    
    // Extraer información del usuario desde Cognito
    const userId = userName;
    const email = userAttributes.email;
    const emailVerified = userAttributes.email_verified === 'true';

    // Crear perfil de usuario en DynamoDB
    const userProfile = {
      userId,
      email,
      emailVerified,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      // Campos opcionales que se pueden actualizar después
      username: email.split('@')[0], // Username temporal basado en email
      profilePicture: null,
      preferences: {
        genres: [],
        languages: ['es'],
      },
    };

    // Insertar en UsersTable
    await docClient.send(new PutCommand({
      TableName: process.env.USERS_TABLE!,
      Item: userProfile,
      ConditionExpression: 'attribute_not_exists(userId)', // Evitar duplicados
    }));

    console.log(`✅ Usuario creado exitosamente: ${userId}`);

    // Retornar el evento sin modificaciones (requerido por Cognito)
    return event;

  } catch (error) {
    console.error('❌ Error en Post Confirmation:', error);
    
    // En caso de error, aún debemos retornar el evento
    // para no bloquear el proceso de registro del usuario
    // El usuario podrá registrarse en Cognito, pero su perfil
    // se creará en el primer login si falla aquí
    return event;
  }
};

/**
 * Función auxiliar para crear perfil de usuario si no existe
 * (puede ser llamada desde otros handlers si es necesario)
 */
export const ensureUserProfile = async (userId: string, email?: string) => {
  try {
    const userProfile = {
      userId,
      email: email || `${userId}@unknown.com`,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      username: userId,
      profilePicture: null,
      preferences: {
        genres: [],
        languages: ['es'],
      },
    };

    await docClient.send(new PutCommand({
      TableName: process.env.USERS_TABLE!,
      Item: userProfile,
      ConditionExpression: 'attribute_not_exists(userId)',
    }));

    console.log(`✅ Perfil de usuario creado: ${userId}`);
    return userProfile;

  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`ℹ️ Usuario ya existe: ${userId}`);
      return null; // Usuario ya existe
    }
    throw error;
  }
};