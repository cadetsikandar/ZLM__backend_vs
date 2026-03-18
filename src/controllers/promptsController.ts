import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { PromptType } from '@prisma/client';

const createSchema = z.object({
  name:    z.string().min(2),
  type:    z.nativeEnum(PromptType),
  content: z.string().min(10),
});

export async function listPrompts(req: AuthRequest, res: Response): Promise<void> {
  const prompts = await prisma.prompt.findMany({ orderBy: [{ type: 'asc' }, { version: 'desc' }] });
  res.json({ prompts });
}

export async function getActivePrompts(req: AuthRequest, res: Response): Promise<void> {
  const prompts = await prisma.prompt.findMany({ where: { isActive: true }, orderBy: { type: 'asc' } });
  res.json({ prompts });
}

export async function createPrompt(req: AuthRequest, res: Response): Promise<void> {
  const data = createSchema.parse(req.body);

  // Deactivate existing prompts of same type
  await prisma.prompt.updateMany({ where: { type: data.type, isActive: true }, data: { isActive: false } });

  const latest = await prisma.prompt.findFirst({ where: { type: data.type }, orderBy: { version: 'desc' } });
  const version = (latest?.version || 0) + 1;

  const prompt = await prisma.prompt.create({
    data: {
      name:      data.name,
      type:      data.type,
      content:   data.content,
      version,
      isActive:  true,
      createdBy: req.user!.name,
    },
  });
  res.status(201).json({ prompt });
}

export async function updatePrompt(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const data   = createSchema.partial().parse(req.body);

  const existing = await prisma.prompt.findUniqueOrThrow({ where: { id } });

  // Create new version
  await prisma.prompt.update({ where: { id }, data: { isActive: false } });
  const prompt = await prisma.prompt.create({
    data: {
      name:      data.name    || existing.name,
      type:      data.type    || existing.type,
      content:   data.content || existing.content,
      version:   existing.version + 1,
      isActive:  true,
      createdBy: req.user!.name,
    },
  });
  res.json({ prompt });
}

export async function deletePrompt(req: AuthRequest, res: Response): Promise<void> {
  await prisma.prompt.delete({ where: { id: req.params.id } });
  res.json({ success: true });
}
