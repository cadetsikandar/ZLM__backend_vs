import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '@prisma/client';

const loginSchema    = z.object({ email: z.string().email(), password: z.string().min(1) });
const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(2),
  role:     z.nativeEnum(UserRole).optional(),
});

function signAccess(user: { id: string; email: string; role: UserRole; name: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    config.jwt.secret as string,
    { expiresIn: '15m' }
  );
}

function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwt.refreshSecret as string, { expiresIn: '7d' });
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password incorrect' });
    return;
  }

  const accessToken  = signAccess(user);
  const refreshToken = signRefresh(user.id);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 86400 * 1000) },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  logger.info('User logged in', { userId: user.id, email: user.email });
  res.json({
    accessToken, refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }

  const { email, password, name, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) { res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Email already registered' }); return; }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash, name, role: role || UserRole.CONTENT_MANAGER },
  });

  const accessToken  = signAccess(user);
  const refreshToken = signRefresh(user.id);
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 86400 * 1000) },
  });

  logger.info('User registered', { userId: user.id, email: user.email });
  res.status(201).json({
    accessToken, refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (!refreshToken) { res.status(400).json({ error: 'MISSING_TOKEN' }); return; }

  let payload: any;
  try { payload = jwt.verify(refreshToken, config.jwt.refreshSecret); }
  catch { res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' }); return; }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    res.status(401).json({ error: 'REFRESH_TOKEN_EXPIRED' }); return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) { res.status(401).json({ error: 'USER_INACTIVE' }); return; }

  // Rotate tokens
  await prisma.refreshToken.delete({ where: { token: refreshToken } });
  const newAccess  = signAccess(user);
  const newRefresh = signRefresh(user.id);
  await prisma.refreshToken.create({
    data: { token: newRefresh, userId: user.id, expiresAt: new Date(Date.now() + 7 * 86400 * 1000) },
  });

  res.json({ accessToken: newAccess, refreshToken: newRefresh });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }).catch(() => {});
  }
  res.json({ message: 'Logged out' });
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
  res.json({ user });
}
