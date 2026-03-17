import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '@prisma/client';

const createSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(2),
  role:     z.nativeEnum(UserRole).default(UserRole.CONTENT_MANAGER),
});

const updateSchema = z.object({
  name:     z.string().min(2).optional(),
  role:     z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function listUsers(req: AuthRequest, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id:true, email:true, name:true, role:true, isActive:true, lastLoginAt:true, createdAt:true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ users });
}

export async function getUser(req: AuthRequest, res: Response): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { id:true, email:true, name:true, role:true, isActive:true, lastLoginAt:true, createdAt:true },
  });
  res.json({ user });
}

export async function createUser(req: AuthRequest, res: Response): Promise<void> {
  const data = createSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: { email: data.email, passwordHash, name: data.name, role: data.role },
    select: { id:true, email:true, name:true, role:true, isActive:true, createdAt:true },
  });
  res.status(201).json({ user });
}

export async function updateUser(req: AuthRequest, res: Response): Promise<void> {
  const data: any = updateSchema.parse(req.body);
  if (data.password) {
    data.passwordHash = await bcrypt.hash(data.password, 12);
    delete data.password;
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id:true, email:true, name:true, role:true, isActive:true, createdAt:true },
  });
  res.json({ user });
}

export async function deleteUser(req: AuthRequest, res: Response): Promise<void> {
  if (req.user?.id === req.params.id) {
    res.status(400).json({ error: 'SELF_DELETE', message: 'Cannot delete your own account' });
    return;
  }
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ success: true });
}
