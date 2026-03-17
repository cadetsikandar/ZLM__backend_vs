import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UserRole } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: UserRole; name: string };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bearer token required' });
    return;
  }

  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwt.secret) as any;
    req.user = { id: payload.sub, email: payload.email, role: payload.role, name: payload.name };
    next();
  } catch (err: any) {
    const msg = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    res.status(401).json({ error: msg, message: 'Token invalid or expired' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'FORBIDDEN', message: `Requires role: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}

export const adminOnly     = authorize(UserRole.ADMIN);
export const contentRoles  = authorize(UserRole.ADMIN, UserRole.CONTENT_MANAGER);
export const qaRoles       = authorize(UserRole.ADMIN, UserRole.QA_REVIEWER);
export const designRoles   = authorize(UserRole.ADMIN, UserRole.DESIGNER);
export const allRoles      = authorize(UserRole.ADMIN, UserRole.CONTENT_MANAGER, UserRole.QA_REVIEWER, UserRole.DESIGNER);
