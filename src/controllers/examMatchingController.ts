import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function listProviders(req: Request, res: Response): Promise<void> {
  const country = (req.query.country as string) || 'USA';
  const providers = await prisma.boardExamMapping.findMany({
    where: { isActive: true, country },
    select: { providerType: true, providerLabel: true, boardExam: true },
    orderBy: { providerLabel: 'asc' },
    distinct: ['providerType'],
  });
  res.json({ providers });
}

export async function listCountries(req: Request, res: Response): Promise<void> {
  const records = await prisma.boardExamMapping.findMany({
    where:    { isActive: true },
    select:   { country: true },
    distinct: ['country'],
    orderBy:  { country: 'asc' },
  });
  res.json({ countries: records.map(r => r.country) });
}

export async function matchExam(req: Request, res: Response): Promise<void> {
  const { providerType, country } = req.body;
  if (!providerType || !country) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'providerType and country are required' });
    return;
  }

  const mapping = await prisma.boardExamMapping.findFirst({
    where: {
      providerType: { equals: providerType, mode: 'insensitive' },
      country:      { equals: country,      mode: 'insensitive' },
      isActive:     true,
    },
  });

  if (!mapping) {
    res.status(404).json({
      error:      'NO_MAPPING_FOUND',
      message:    `No board exam mapping for ${providerType} in ${country}`,
      suggestion: 'Check /api/providers and /api/countries for supported combinations',
    });
    return;
  }

  res.json({
    confirmed:     false,
    provider:      mapping.providerLabel,
    providerType:  mapping.providerType,
    country:       mapping.country,
    exam:          mapping.boardExam,
    boardExam:     mapping.boardExam,
    boardFullName: mapping.boardFullName,
    examUrl:       mapping.examUrl,
    coreClasses:   JSON.parse(mapping.coreClasses),
    contentNotes:  mapping.contentNotes,
    body:          mapping.boardFullName,
    notes:         mapping.contentNotes,
    receipt:       `${mapping.country} — ${mapping.providerLabel} → ${mapping.boardExam}`,
  });
}

export async function getAllMappings(req: Request, res: Response): Promise<void> {
  const mappings = await prisma.boardExamMapping.findMany({
    where:   { isActive: true },
    orderBy: [{ country: 'asc' }, { providerLabel: 'asc' }],
  });
  res.json({ mappings });
}
