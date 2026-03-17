import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { getQueueHealth } from '../queues';
import { storageService } from '../services/storageService';
import { config } from '../config/env';

export async function getDashboardStats(req: AuthRequest, res: Response): Promise<void> {
  const [
    totalBooks, publishedBooks, totalChapters, completedChapters,
    generatingBooks, qaPassedBooks, evidenceAlerts, recentJobs,
  ] = await Promise.all([
    prisma.book.count(),
    prisma.book.count({ where: { status: 'PUBLISHED' } }),
    prisma.chapter.count(),
    prisma.chapter.count({ where: { status: { in: ['GENERATED','QA_PASSED','DESIGN_READY'] } } }),
    prisma.book.count({ where: { status: { in: ['GENERATING','QA_PENDING','QA_IN_PROGRESS'] } } }),
    prisma.book.count({ where: { status: { in: ['QA_PASSED','DESIGN_READY','KDP_READY','PUBLISHED'] } } }),
    prisma.evidenceAlert.count({ where: { status: 'pending' } }),
    prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id:true, type:true, status:true, createdAt:true, bookId:true } }),
  ]);

  const overallProgress = totalBooks > 0 ? Math.round((qaPassedBooks / totalBooks) * 100) : 0;

  // Cost estimate
  const estCostPerChapter = 0.92;
  const estSpend          = completedChapters * estCostPerChapter;

  res.json({
    totalBooks, publishedBooks, totalChapters, completedChapters,
    generatingBooks, qaPassedBooks, evidenceAlerts,
    overallProgress, estSpend: Math.round(estSpend),
    recentActivity: recentJobs.map(j => ({
      id:      j.id,
      type:    j.type,
      status:  j.status,
      bookId:  j.bookId,
      time:    j.createdAt,
    })),
  });
}

export async function getSystemHealth(req: AuthRequest, res: Response): Promise<void> {
  // DB
  let dbStatus = 'offline';
  try { await prisma.$queryRaw`SELECT 1`; dbStatus = 'connected'; } catch {}

  // Redis / Queues
  let redisStatus = 'offline';
  let queueHealth: any = {};
  try { queueHealth = await getQueueHealth(); redisStatus = 'connected'; } catch { queueHealth = {}; }

  // S3
  const s3Status = storageService.isS3Configured() ? 'connected' : 'local';

  // OpenAI
  const openaiStatus = (config.openai.apiKey || config.aws.useSecretsManager) ? 'configured' : 'not_configured';

  // GitHub
  const githubStatus = (config.github.token && config.github.repoOwner) ? 'configured' : 'not_configured';

  // Secrets
  const secretsStatus = config.aws.useSecretsManager ? 'configured' : 'env_only';

  const allOk = dbStatus === 'connected' && redisStatus === 'connected';

  res.json({
    status:    allOk ? 'healthy' : 'degraded',
    version:   process.env.npm_package_version || '2.0.0',
    uptime:    Math.round(process.uptime()),
    db:        dbStatus,
    redis:     redisStatus,
    openai:    openaiStatus,
    github:    githubStatus,
    s3:        s3Status,
    secrets:   secretsStatus,
    queues:    queueHealth,
    timestamp: new Date().toISOString(),
  });
}

export async function getActivityFeed(req: AuthRequest, res: Response): Promise<void> {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    take:    50,
    include: { book: { select: { title: true, certificationTrack: true } } },
  });

  res.json({
    feed: jobs.map(j => ({
      id:        j.id,
      type:      j.type,
      status:    j.status,
      bookTitle: j.book?.title,
      track:     j.book?.certificationTrack,
      time:      j.createdAt,
      error:     j.error,
    })),
  });
}

export async function getEditorFlagsForAllBooks(req: AuthRequest, res: Response): Promise<void> {
  const { getBookEditorFlags } = await import('../services/editorChecklistService');
  const books = await prisma.book.findMany({
    where:  { status: { in: ['GENERATING','QA_PENDING','QA_PASSED'] } },
    select: { id: true, title: true, certificationTrack: true },
    take: 10,
  });

  const flagsByBook: any[] = [];
  for (const book of books) {
    const flags = await getBookEditorFlags(book.id);
    if (flags.length > 0) {
      flagsByBook.push({
        bookId:    book.id,
        bookTitle: book.title,
        track:     book.certificationTrack,
        flags,
        criticalCount: flags.filter(f => f.severity === 'critical').length,
        warningCount:  flags.filter(f => f.severity === 'warning').length,
      });
    }
  }

  res.json({ flagsByBook, totalCritical: flagsByBook.reduce((s,b) => s+b.criticalCount, 0) });
}
