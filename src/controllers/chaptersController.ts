import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { AuthRequest } from '../middleware/auth';
import { chapterQueue, qaQueue } from '../queues';
import { storageService } from '../services/storageService';
import { ChapterStatus } from '@prisma/client';

const addChapterSchema = z.object({ chapterNumber: z.number().int().min(1), title: z.string().min(2) });

export async function listChapters(req: AuthRequest, res: Response): Promise<void> {
  const { bookId, status } = req.query as any;
  const where: any = {};
  if (bookId) where.bookId = bookId;
  if (status) where.status = status;

  const chapters = await prisma.chapter.findMany({
    where,
    orderBy: [{ bookId: 'asc' }, { chapterNumber: 'asc' }],
    include: { book: { select: { certificationTrack: true, trackNumber: true, title: true } } },
  });
  res.json({ chapters });
}

export async function getChapter(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await prisma.chapter.findUnique({
    where:   { id: req.params.id },
    include: { book: true, qaReports: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!chapter) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json({ chapter });
}

export async function triggerChapterGeneration(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await prisma.chapter.findUnique({ where: { id: req.params.id }, include: { book: true } });
  if (!chapter) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

  if (!['PENDING', 'QA_FAILED'].includes(chapter.status) && req.query.force !== 'true') {
    res.status(409).json({ error: 'INVALID_STATUS', message: `Chapter is ${chapter.status}. Use ?force=true to regenerate.` });
    return;
  }

  await prisma.chapter.update({ where: { id: req.params.id }, data: { status: ChapterStatus.PENDING } });
  const job = await chapterQueue.add({ chapterId: chapter.id, bookId: chapter.bookId });

  await prisma.job.create({ data: { bookId: chapter.bookId, chapterId: chapter.id, type: 'CHAPTER_GENERATION', bullJobId: String(job.id), status: 'WAITING' } });

  res.json({ jobId: job.id, status: 'queued', chapterId: chapter.id, estimatedMinutes: 8 });
}

export async function triggerQA(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await prisma.chapter.findUnique({ where: { id: req.params.id } });
  if (!chapter) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

  if (!['GENERATED', 'QA_FAILED', 'QA_PASSED'].includes(chapter.status)) {
    res.status(422).json({ error: 'CHAPTER_NOT_GENERATED', message: 'Chapter must be generated before QA can run.' });
    return;
  }

  const { strictMode = true } = req.body;
  const job = await qaQueue.add({ chapterId: chapter.id, strictMode });
  await prisma.job.create({ data: { bookId: chapter.bookId, chapterId: chapter.id, type: 'QA_AUDIT', bullJobId: String(job.id), status: 'WAITING' } });

  await prisma.chapter.update({ where: { id: req.params.id }, data: { status: ChapterStatus.QA_PENDING } });
  res.json({ jobId: job.id, status: 'queued', chapterId: chapter.id });
}

export async function getQaReport(req: AuthRequest, res: Response): Promise<void> {
  const { getReport } = await import('../services/qaService');
  try {
    const report = await getReport(req.params.id);
    res.json({ report });
  } catch {
    res.status(404).json({ error: 'NO_REPORT', message: 'No QA report found for this chapter.' });
  }
}

export async function downloadChapter(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await prisma.chapter.findUnique({ where: { id: req.params.id } });
  if (!chapter?.contentS3Key) { res.status(404).json({ error: 'NO_CONTENT', message: 'Chapter content not yet generated.' }); return; }

  try {
    const url = await storageService.getPresignedUrl(chapter.contentS3Key);
    if (url.startsWith('local://')) {
      // Serve local file
      const key = chapter.contentS3Key.replace('local://', '');
      const buf = await storageService.downloadFile(key);
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="chapter-${String(chapter.chapterNumber).padStart(2,'0')}.md"`);
      res.send(buf);
    } else {
      res.json({ downloadUrl: url, expiresIn: 3600 });
    }
  } catch {
    res.status(500).json({ error: 'DOWNLOAD_FAILED' });
  }
}

export async function clearChapter(req: AuthRequest, res: Response): Promise<void> {
  await prisma.chapter.update({
    where: { id: req.params.id },
    data: { status: ChapterStatus.PENDING, wordCount: 0, contentS3Key: null, githubCommitSha: null, qaScore: null, editorFlags: null, hasEditorIssues: false },
  });
  res.json({ message: 'Chapter cleared — ready to regenerate' });
}

export async function deleteChapter(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await prisma.chapter.findUnique({ where: { id: req.params.id } });
  if (!chapter) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  await prisma.chapter.delete({ where: { id: req.params.id } });
  await prisma.book.update({ where: { id: chapter.bookId }, data: { totalChapters: { decrement: 1 } } });
  res.json({ message: 'Chapter deleted' });
}

export async function addChapter(req: AuthRequest, res: Response): Promise<void> {
  const parsed = addChapterSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }

  const chapter = await prisma.chapter.create({
    data: {
      bookId:        req.params.bookId,
      chapterNumber: parsed.data.chapterNumber,
      title:         parsed.data.title,
      status:        ChapterStatus.PENDING,
    },
  });
  await prisma.book.update({ where: { id: req.params.bookId }, data: { totalChapters: { increment: 1 } } });
  res.status(201).json({ chapter });
}

export async function getEditorFlags(req: AuthRequest, res: Response): Promise<void> {
  const { getEditorFlags: getFlags, runEditorChecklist } = await import('../services/editorChecklistService');
  const chapter = await prisma.chapter.findUnique({ where: { id: req.params.id } });
  if (!chapter) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

  // Re-run checklist if chapter has no flags yet but has content
  if (!chapter.editorFlags && chapter.contentS3Key) {
    try { await runEditorChecklist(req.params.id); } catch {}
  }

  const flags = await getFlags(req.params.id);
  res.json({ flags, hasIssues: flags.some(f => f.severity === 'critical') });
}
