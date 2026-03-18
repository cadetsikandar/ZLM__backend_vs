import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { AuthRequest } from '../middleware/auth';
import { tocQueue, chapterQueue, bundleQueue } from '../queues';
import { BookStatus, BundleType, CertificationTrack } from '@prisma/client';

const createBookSchema = z.object({
  title:               z.string().min(3),
  subtitle:            z.string().optional(),
  certificationTrack:  z.nativeEnum(CertificationTrack),
  trackNumber:         z.number().int().min(1).max(10),
  country:             z.string().default('USA'),
  boardExam:           z.string().optional(),
  bundleType:          z.nativeEnum(BundleType).optional(),
});

const updateBookSchema = createBookSchema.partial();

// ── LIST / GET ─────────────────────────────────────────────────────────────────
export async function listBooks(req: AuthRequest, res: Response): Promise<void> {
  const { track, status, country, bundleType, search, page = '1', limit = '50' } = req.query as any;

  const where: any = {};
  if (track)      where.certificationTrack = track;
  if (status)     where.status            = status;
  if (country)    where.country           = country;
  if (bundleType) where.bundleType        = bundleType;
  if (search)     where.title             = { contains: search, mode: 'insensitive' };

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      orderBy: [{ certificationTrack: 'asc' }, { trackNumber: 'asc' }],
      skip:    (parseInt(page) - 1) * parseInt(limit),
      take:    parseInt(limit),
      include: { _count: { select: { chapters: true } } },
    }),
    prisma.book.count({ where }),
  ]);

  res.json({ books, total, page: parseInt(page), limit: parseInt(limit) });
}

export async function getBook(req: AuthRequest, res: Response): Promise<void> {
  const book = await prisma.book.findUnique({
    where:   { id: req.params.id },
    include: { chapters: { orderBy: { chapterNumber: 'asc' } }, _count: { select: { chapters: true } } },
  });
  if (!book) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json({ book });
}

// ── CREATE / UPDATE / DELETE ───────────────────────────────────────────────────
export async function createBook(req: AuthRequest, res: Response): Promise<void> {
  const parsed = createBookSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }

  const data  = parsed.data;
  const branch = `track-${data.certificationTrack.toLowerCase()}-book-${data.trackNumber}`;

  const book = await prisma.book.create({
    data: {
      ...data,
      bundleType:   data.bundleType || BundleType.TEXTBOOK,
      githubBranch: branch,
      s3Folder:     `manuscripts/${data.certificationTrack.toLowerCase()}/book-${data.trackNumber}/`,
    },
  });

  await prisma.auditLog.create({ data: { userId: req.user!.id, bookId: book.id, action: 'BOOK_CREATED', details: { title: book.title } } });
  logger.info('Book created', { bookId: book.id, title: book.title });
  res.status(201).json({ book });
}

export async function updateBook(req: AuthRequest, res: Response): Promise<void> {
  const parsed = updateBookSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }

  const book = await prisma.book.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ book });
}

export async function deleteBook(req: AuthRequest, res: Response): Promise<void> {
  await prisma.book.delete({ where: { id: req.params.id } });
  logger.info('Book deleted', { bookId: req.params.id });
  res.json({ message: 'Book deleted' });
}

// ── GENERATION TRIGGERS ────────────────────────────────────────────────────────
export async function triggerToc(req: AuthRequest, res: Response): Promise<void> {
  const book = await prisma.book.findUnique({ where: { id: req.params.id } });
  if (!book) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

  const force = req.query.force === 'true';
  const existingChapters = await prisma.chapter.count({ where: { bookId: book.id } });
  if (existingChapters > 0 && !force) {
    res.status(409).json({ error: 'TOC_EXISTS', message: 'TOC already generated. Use ?force=true to regenerate.' });
    return;
  }

  const job = await tocQueue.add({ bookId: book.id, certificationTrack: book.certificationTrack, trackNumber: book.trackNumber });
  const dbJob = await prisma.job.create({ data: { bookId: book.id, type: 'TOC_GENERATION', bullJobId: String(job.id), status: 'WAITING' } });

  await prisma.book.update({ where: { id: book.id }, data: { status: BookStatus.GENERATING } });
  res.json({ jobId: dbJob.id, bullJobId: job.id, status: 'queued', estimatedMinutes: 3 });
}

export async function generateAllChapters(req: AuthRequest, res: Response): Promise<void> {
  const chapters = await prisma.chapter.findMany({
    where: { bookId: req.params.id, status: 'PENDING' },
    orderBy: { chapterNumber: 'asc' },
  });
  if (!chapters.length) { res.status(400).json({ error: 'NO_PENDING_CHAPTERS', message: 'No pending chapters found. Generate TOC first.' }); return; }

  const jobs = await Promise.all(
    chapters.map((ch, i) =>
      chapterQueue.add({ chapterId: ch.id, bookId: req.params.id }, { delay: i * 2000 })
    )
  );

  res.json({ queued: jobs.length, message: `${jobs.length} chapters queued for generation` });
}

export async function triggerKdpMetadata(req: AuthRequest, res: Response): Promise<void> {
  const { generateKDPMetadata } = await import('../services/kdpMetadataService');
  const metadata = await generateKDPMetadata(req.params.id);
  res.json({ metadata });
}

// ── BUNDLE GENERATION ─────────────────────────────────────────────────────────
export async function triggerReview(req: AuthRequest, res: Response): Promise<void> {
  const job = await bundleQueue.add({ type: 'review', bookId: req.params.id });
  await prisma.job.create({ data: { bookId: req.params.id, type: 'BUNDLE_REVIEW', bullJobId: String(job.id), status: 'WAITING' } });
  res.json({ jobId: job.id, status: 'queued', type: 'review' });
}

export async function triggerQuestions(req: AuthRequest, res: Response): Promise<void> {
  const { questionsPerChapter = 30 } = req.body;
  const job = await bundleQueue.add({ type: 'qbank', bookId: req.params.id, questionsPerChapter });
  await prisma.job.create({ data: { bookId: req.params.id, type: 'BUNDLE_QBANK', bullJobId: String(job.id), status: 'WAITING' } });
  res.json({ jobId: job.id, status: 'queued', type: 'qbank' });
}

export async function triggerMnemonics(req: AuthRequest, res: Response): Promise<void> {
  const job = await bundleQueue.add({ type: 'mnemonics', bookId: req.params.id });
  await prisma.job.create({ data: { bookId: req.params.id, type: 'BUNDLE_MNEMONICS', bullJobId: String(job.id), status: 'WAITING' } });
  res.json({ jobId: job.id, status: 'queued', type: 'mnemonics' });
}

export async function getBundleStatus(req: AuthRequest, res: Response): Promise<void> {
  const { getBundleStatus } = await import('../services/bundleService');
  const status = await getBundleStatus(req.params.id);
  res.json(status);
}

// ── BACKUP ────────────────────────────────────────────────────────────────────
export async function backupBook(req: AuthRequest, res: Response): Promise<void> {
  const { backupQueue } = await import('../queues');
  const job = await backupQueue.add({ bookId: req.params.id });
  res.json({ jobId: job.id, status: 'queued' });
}
