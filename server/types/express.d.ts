import { AuthUser } from '../../shared/schema';

declare global {
  namespace Express {
    interface User extends AuthUser {}
    interface Request {
      user?: AuthUser;
    }
  }
}