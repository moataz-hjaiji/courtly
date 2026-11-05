import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errors.js';

export type Role = 'user' | 'admin';
export interface AuthUser {
  id: number;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export const signToken = (user: AuthUser) => jwt.sign({ sub: String(user.id), role: user.role }, SECRET, { expiresIn: '8h' });

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Login required');
  try {
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload;
    req.user = { id: Number(payload.sub), role: payload.role as Role };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  }
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Admin only');
  next();
};

/** Narrows req.user after requireAuth ran. */
export const currentUser = (req: Express.Request): AuthUser => {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Login required');
  return req.user;
};
