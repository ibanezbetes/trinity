import { PostConfirmationTriggerHandler } from 'aws-lambda';
/**
 * AuthHandler: Post Confirmation Trigger
 * Se ejecuta automáticamente después de que un usuario confirme su registro
 * Crea el perfil del usuario en la tabla UsersTable
 */
export declare const handler: PostConfirmationTriggerHandler;
/**
 * Función auxiliar para crear perfil de usuario si no existe
 * (puede ser llamada desde otros handlers si es necesario)
 */
export declare const ensureUserProfile: (userId: string, email?: string) => Promise<{
    userId: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    username: string;
    profilePicture: null;
    preferences: {
        genres: never[];
        languages: string[];
    };
} | null>;
