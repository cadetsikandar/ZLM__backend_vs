import Bull from 'bull';
import { config } from '../config/env';
import { logger } from '../config/logger';

// ── Queue factory ─────────────────────────────────────────────────────────────
function makeQueue(name: string, concurrency: number): Bull.Queue {
  const q = new Bull(name, {
    redis: config.redis.url,
    defaultJobOptions: {
      attempts:    3,
      backoff:     { type: 'exponential', delay: 60000 }, // 1m, 2m, 4m
      removeOnComplete: 50,
      removeOnFail:     100,
    },
  });

  q.on('error',   (err)  => logger.error(`[${name}] Queue error`,   { error: err.message }));
  q.on('failed',  (job, err) => logger.error(`[${name}] Job failed`, { jobId: job.id, error: err.message }));
  q.on('stalled', (job)  => logger.warn(`[${name}] Job stalled`,    { jobId: job.id }));

  return q;
}

// ── Queues ─────────────────────────────────────────────────────────────────────
export const tocQueue     = makeQueue('toc',      2);
export const chapterQueue = makeQueue('chapter',  config.queue.chapterConcurrency);
export const qaQueue      = makeQueue('qa',       config.queue.qaConcurrency);
export const bundleQueue  = makeQueue('bundle',   2);
export const backupQueue  = makeQueue('backup',   2);

// ── TOC processor ──────────────────────────────────────────────────────────────
tocQueue.process(2, async (job) => {
  const { bookId, certificationTrack, trackNumber } = job.data;
  logger.info('[tocQueue] Processing', { bookId });
  const { manuscriptService } = await import('../services/manuscriptService');
  const { prisma }            = await import('../config/prisma');
  try {
    const chapters = await manuscriptService.generateToc(bookId, certificationTrack, trackNumber);
    await prisma.job.updateMany({ where: { bullJobId: String(job.id) }, data: { status: 'COMPLETED', finishedAt: new Date(), result: { chaptersCreated: chapters.length } } });
    return { chaptersCreated: chapters.length };
  } catch (err: any) {
    await prisma.job.updateMany({ where: { bullJobId: String(job.id) }, data: { status: 'FAILED', error: err.message } });
    throw err;
  }
});

// ── Chapter processor ──────────────────────────────────────────────────────────
chapterQueue.process(config.queue.chapterConcurrency, async (job) => {
  const { chapterId, bookId } = job.data;
  logger.info('[chapterQueue] Processing', { chapterId });
  const { manuscriptService } = await import('../services/manuscriptService');
  const { prisma }            = await import('../config/prisma');
  try {
    const result = await manuscriptService.generateChapter(chapterId);
    await prisma.job.updateMany({ where: { bullJobId: String(job.id) }, data: { status: 'COMPLETED', finishedAt: new Date(), result } });
    return result;
  } catch (err: any) {
    await prisma.job.updateMany({ where: { bullJobId: String(job.id) }, data: { status: 'FAILED', error: err.message } });
    throw err;
  }
});

// ── QA processor ──────────────────────────────────────────────────────────────
qaQueue.process(config.queue.qaConcurrency, async (job) => {
  const { chapterId, strictMode = true } = job.data;
  logger.info('[qaQueue] Processing', { chapterId });
  const { qaService } = await import('../services/qaService');
  const { prisma }    = await import('../config/prisma');
  try {
    const result = await qaService.runQA(chapterId, strictMode);
    await prisma.job.updateMany({ where: { bullJobId: String(job.id) }, data: { status: 'COMPLETED', finishedAt: new Date(), result } });
    return result;
  } catch (err: any) {
    await prisma.job.updateMany({ where: { bullJobId: String(job.id) }, data: { status: 'FAILED', error: err.message } });
    throw err;
  }
});

// ── Bundle processor ───────────────────────────────────────────────────────────
bundleQueue.process(2, async (job) => {
  const { type, bookId, questionsPerChapter } = job.data;
  logger.info('[bundleQueue] Processing', { type, bookId });
  const { generateReviewBook, generateQuestionBank, generateMnemonicBook } = await import('../services/bundleService');
  const { prisma } = await import('../config/prisma');
  try {
    let result: any;
    if (type === 'review')    result = await generateReviewBook(bookId);
    if (type === 'qbank')     result = await generateQuestionBank(bookId, questionsPerChapter);
    if (type === 'mnemonics') result = await generateMnemonicBook(bookId);
    await prisma.job.updateMany({ where: { bullJobId: String(job.id) }, data: { status: 'COMPLETED', finishedAt: new Date() } });
    return result;
  } catch (err: any) {
    await prisma.job.updateMany({ where: { bullJobId: String(job.id) }, data: { status: 'FAILED', error: err.message } });
    throw err;
  }
});

// ── Health check ───────────────────────────────────────────────────────────────
export async function getQueueHealth(): Promise<Record<string, any>> {
  const queues = { tocQueue, chapterQueue, qaQueue, bundleQueue };
  const health: Record<string, any> = {};
  for (const [name, q] of Object.entries(queues)) {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        q.getWaitingCount(), q.getActiveCount(), q.getCompletedCount(), q.getFailedCount(),
      ]);
      health[name] = { waiting, active, completed, failed };
    } catch { health[name] = { error: 'unavailable' }; }
  }
  return health;
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
export async function closeQueues(): Promise<void> {
  await Promise.all([tocQueue.close(), chapterQueue.close(), qaQueue.close(), bundleQueue.close(), backupQueue.close()]);
  logger.info('All queues closed');
}
