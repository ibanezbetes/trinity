import { EnhancedUserContext } from '../modules/auth/middleware/user-context.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: EnhancedUserContext;
      userContext?: EnhancedUserContext;
    }
    
    // Override the default User type from @types/express
    interface User extends EnhancedUserContext {}
  }
}

export { };

