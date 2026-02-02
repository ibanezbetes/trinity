"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserProfile = exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * AuthHandler: Post Confirmation Trigger
 * Se ejecuta automáticamente después de que un usuario confirme su registro
 * Crea el perfil del usuario en la tabla UsersTable
 */
const handler = async (event) => {
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
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.USERS_TABLE,
            Item: userProfile,
            ConditionExpression: 'attribute_not_exists(userId)', // Evitar duplicados
        }));
        console.log(`✅ Usuario creado exitosamente: ${userId}`);
        // Retornar el evento sin modificaciones (requerido por Cognito)
        return event;
    }
    catch (error) {
        console.error('❌ Error en Post Confirmation:', error);
        // En caso de error, aún debemos retornar el evento
        // para no bloquear el proceso de registro del usuario
        // El usuario podrá registrarse en Cognito, pero su perfil
        // se creará en el primer login si falla aquí
        return event;
    }
};
exports.handler = handler;
/**
 * Función auxiliar para crear perfil de usuario si no existe
 * (puede ser llamada desde otros handlers si es necesario)
 */
const ensureUserProfile = async (userId, email) => {
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
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.USERS_TABLE,
            Item: userProfile,
            ConditionExpression: 'attribute_not_exists(userId)',
        }));
        console.log(`✅ Perfil de usuario creado: ${userId}`);
        return userProfile;
    }
    catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.log(`ℹ️ Usuario ya existe: ${userId}`);
            return null; // Usuario ya existe
        }
        throw error;
    }
};
exports.ensureUserProfile = ensureUserProfile;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUUzRSxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVEOzs7O0dBSUc7QUFDSSxNQUFNLE9BQU8sR0FBbUMsS0FBSyxFQUFFLEtBQW1DLEVBQUUsRUFBRTtJQUNuRyxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTdFLElBQUksQ0FBQztRQUNILE1BQU0sRUFBRSxjQUFjLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDO1FBQ3pDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFFaEMsZ0RBQWdEO1FBQ2hELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQztRQUN4QixNQUFNLEtBQUssR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDO1FBQ25DLE1BQU0sYUFBYSxHQUFHLGNBQWMsQ0FBQyxjQUFjLEtBQUssTUFBTSxDQUFDO1FBRS9ELHNDQUFzQztRQUN0QyxNQUFNLFdBQVcsR0FBRztZQUNsQixNQUFNO1lBQ04sS0FBSztZQUNMLGFBQWE7WUFDYixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7WUFDbkMsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ25DLFFBQVEsRUFBRSxJQUFJO1lBQ2QscURBQXFEO1lBQ3JELFFBQVEsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLG9DQUFvQztZQUNuRSxjQUFjLEVBQUUsSUFBSTtZQUNwQixXQUFXLEVBQUU7Z0JBQ1gsTUFBTSxFQUFFLEVBQUU7Z0JBQ1YsU0FBUyxFQUFFLENBQUMsSUFBSSxDQUFDO2FBQ2xCO1NBQ0YsQ0FBQztRQUVGLHlCQUF5QjtRQUN6QixNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSx5QkFBVSxDQUFDO1lBQ2xDLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVk7WUFDbkMsSUFBSSxFQUFFLFdBQVc7WUFDakIsbUJBQW1CLEVBQUUsOEJBQThCLEVBQUUsb0JBQW9CO1NBQzFFLENBQUMsQ0FBQyxDQUFDO1FBRUosT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUV4RCxnRUFBZ0U7UUFDaEUsT0FBTyxLQUFLLENBQUM7SUFFZixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdEQsbURBQW1EO1FBQ25ELHNEQUFzRDtRQUN0RCwwREFBMEQ7UUFDMUQsNkNBQTZDO1FBQzdDLE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztBQUNILENBQUMsQ0FBQztBQWxEVyxRQUFBLE9BQU8sV0FrRGxCO0FBRUY7OztHQUdHO0FBQ0ksTUFBTSxpQkFBaUIsR0FBRyxLQUFLLEVBQUUsTUFBYyxFQUFFLEtBQWMsRUFBRSxFQUFFO0lBQ3hFLElBQUksQ0FBQztRQUNILE1BQU0sV0FBVyxHQUFHO1lBQ2xCLE1BQU07WUFDTixLQUFLLEVBQUUsS0FBSyxJQUFJLEdBQUcsTUFBTSxjQUFjO1lBQ3ZDLGFBQWEsRUFBRSxLQUFLO1lBQ3BCLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNuQyxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7WUFDbkMsUUFBUSxFQUFFLElBQUk7WUFDZCxRQUFRLEVBQUUsTUFBTTtZQUNoQixjQUFjLEVBQUUsSUFBSTtZQUNwQixXQUFXLEVBQUU7Z0JBQ1gsTUFBTSxFQUFFLEVBQUU7Z0JBQ1YsU0FBUyxFQUFFLENBQUMsSUFBSSxDQUFDO2FBQ2xCO1NBQ0YsQ0FBQztRQUVGLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUM7WUFDbEMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBWTtZQUNuQyxJQUFJLEVBQUUsV0FBVztZQUNqQixtQkFBbUIsRUFBRSw4QkFBOEI7U0FDcEQsQ0FBQyxDQUFDLENBQUM7UUFFSixPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELE9BQU8sV0FBVyxDQUFDO0lBRXJCLENBQUM7SUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1FBQ3BCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxpQ0FBaUMsRUFBRSxDQUFDO1lBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDL0MsT0FBTyxJQUFJLENBQUMsQ0FBQyxvQkFBb0I7UUFDbkMsQ0FBQztRQUNELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQWpDVyxRQUFBLGlCQUFpQixxQkFpQzVCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUG9zdENvbmZpcm1hdGlvblRyaWdnZXJFdmVudCwgUG9zdENvbmZpcm1hdGlvblRyaWdnZXJIYW5kbGVyIH0gZnJvbSAnYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcclxuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcblxyXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xyXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcclxuXHJcbi8qKlxyXG4gKiBBdXRoSGFuZGxlcjogUG9zdCBDb25maXJtYXRpb24gVHJpZ2dlclxyXG4gKiBTZSBlamVjdXRhIGF1dG9tw6F0aWNhbWVudGUgZGVzcHXDqXMgZGUgcXVlIHVuIHVzdWFyaW8gY29uZmlybWUgc3UgcmVnaXN0cm9cclxuICogQ3JlYSBlbCBwZXJmaWwgZGVsIHVzdWFyaW8gZW4gbGEgdGFibGEgVXNlcnNUYWJsZVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IFBvc3RDb25maXJtYXRpb25UcmlnZ2VySGFuZGxlciA9IGFzeW5jIChldmVudDogUG9zdENvbmZpcm1hdGlvblRyaWdnZXJFdmVudCkgPT4ge1xyXG4gIGNvbnNvbGUubG9nKCfwn5SQIFBvc3QgQ29uZmlybWF0aW9uIFRyaWdnZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHsgdXNlckF0dHJpYnV0ZXMgfSA9IGV2ZW50LnJlcXVlc3Q7XHJcbiAgICBjb25zdCB1c2VyTmFtZSA9IGV2ZW50LnVzZXJOYW1lO1xyXG4gICAgXHJcbiAgICAvLyBFeHRyYWVyIGluZm9ybWFjacOzbiBkZWwgdXN1YXJpbyBkZXNkZSBDb2duaXRvXHJcbiAgICBjb25zdCB1c2VySWQgPSB1c2VyTmFtZTtcclxuICAgIGNvbnN0IGVtYWlsID0gdXNlckF0dHJpYnV0ZXMuZW1haWw7XHJcbiAgICBjb25zdCBlbWFpbFZlcmlmaWVkID0gdXNlckF0dHJpYnV0ZXMuZW1haWxfdmVyaWZpZWQgPT09ICd0cnVlJztcclxuXHJcbiAgICAvLyBDcmVhciBwZXJmaWwgZGUgdXN1YXJpbyBlbiBEeW5hbW9EQlxyXG4gICAgY29uc3QgdXNlclByb2ZpbGUgPSB7XHJcbiAgICAgIHVzZXJJZCxcclxuICAgICAgZW1haWwsXHJcbiAgICAgIGVtYWlsVmVyaWZpZWQsXHJcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIC8vIENhbXBvcyBvcGNpb25hbGVzIHF1ZSBzZSBwdWVkZW4gYWN0dWFsaXphciBkZXNwdcOpc1xyXG4gICAgICB1c2VybmFtZTogZW1haWwuc3BsaXQoJ0AnKVswXSwgLy8gVXNlcm5hbWUgdGVtcG9yYWwgYmFzYWRvIGVuIGVtYWlsXHJcbiAgICAgIHByb2ZpbGVQaWN0dXJlOiBudWxsLFxyXG4gICAgICBwcmVmZXJlbmNlczoge1xyXG4gICAgICAgIGdlbnJlczogW10sXHJcbiAgICAgICAgbGFuZ3VhZ2VzOiBbJ2VzJ10sXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEluc2VydGFyIGVuIFVzZXJzVGFibGVcclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHVzZXJQcm9maWxlLFxyXG4gICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHModXNlcklkKScsIC8vIEV2aXRhciBkdXBsaWNhZG9zXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYOKchSBVc3VhcmlvIGNyZWFkbyBleGl0b3NhbWVudGU6ICR7dXNlcklkfWApO1xyXG5cclxuICAgIC8vIFJldG9ybmFyIGVsIGV2ZW50byBzaW4gbW9kaWZpY2FjaW9uZXMgKHJlcXVlcmlkbyBwb3IgQ29nbml0bylcclxuICAgIHJldHVybiBldmVudDtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBlbiBQb3N0IENvbmZpcm1hdGlvbjonLCBlcnJvcik7XHJcbiAgICBcclxuICAgIC8vIEVuIGNhc28gZGUgZXJyb3IsIGHDum4gZGViZW1vcyByZXRvcm5hciBlbCBldmVudG9cclxuICAgIC8vIHBhcmEgbm8gYmxvcXVlYXIgZWwgcHJvY2VzbyBkZSByZWdpc3RybyBkZWwgdXN1YXJpb1xyXG4gICAgLy8gRWwgdXN1YXJpbyBwb2Ryw6EgcmVnaXN0cmFyc2UgZW4gQ29nbml0bywgcGVybyBzdSBwZXJmaWxcclxuICAgIC8vIHNlIGNyZWFyw6EgZW4gZWwgcHJpbWVyIGxvZ2luIHNpIGZhbGxhIGFxdcOtXHJcbiAgICByZXR1cm4gZXZlbnQ7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIEZ1bmNpw7NuIGF1eGlsaWFyIHBhcmEgY3JlYXIgcGVyZmlsIGRlIHVzdWFyaW8gc2kgbm8gZXhpc3RlXHJcbiAqIChwdWVkZSBzZXIgbGxhbWFkYSBkZXNkZSBvdHJvcyBoYW5kbGVycyBzaSBlcyBuZWNlc2FyaW8pXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZW5zdXJlVXNlclByb2ZpbGUgPSBhc3luYyAodXNlcklkOiBzdHJpbmcsIGVtYWlsPzogc3RyaW5nKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHVzZXJQcm9maWxlID0ge1xyXG4gICAgICB1c2VySWQsXHJcbiAgICAgIGVtYWlsOiBlbWFpbCB8fCBgJHt1c2VySWR9QHVua25vd24uY29tYCxcclxuICAgICAgZW1haWxWZXJpZmllZDogZmFsc2UsXHJcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIHVzZXJuYW1lOiB1c2VySWQsXHJcbiAgICAgIHByb2ZpbGVQaWN0dXJlOiBudWxsLFxyXG4gICAgICBwcmVmZXJlbmNlczoge1xyXG4gICAgICAgIGdlbnJlczogW10sXHJcbiAgICAgICAgbGFuZ3VhZ2VzOiBbJ2VzJ10sXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHVzZXJQcm9maWxlLFxyXG4gICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHModXNlcklkKScsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYOKchSBQZXJmaWwgZGUgdXN1YXJpbyBjcmVhZG86ICR7dXNlcklkfWApO1xyXG4gICAgcmV0dXJuIHVzZXJQcm9maWxlO1xyXG5cclxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ0NvbmRpdGlvbmFsQ2hlY2tGYWlsZWRFeGNlcHRpb24nKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDihLnvuI8gVXN1YXJpbyB5YSBleGlzdGU6ICR7dXNlcklkfWApO1xyXG4gICAgICByZXR1cm4gbnVsbDsgLy8gVXN1YXJpbyB5YSBleGlzdGVcclxuICAgIH1cclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufTsiXX0=