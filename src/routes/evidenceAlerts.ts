import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, adminOnly } from '../middleware/auth';
import { chapterQueue } from '../queues';

const router = Router();

router.use(authenticate, adminOnly);

// GET /api/evidence-alerts — list pending alerts
router.get('/', async (req, res) => {
  const { status = 'pending', limit = '20' } = req.query as any;
  const alerts = await prisma.evidenceAlert.findMany({
    where:   status === 'all' ? {} : { status },
    orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
    take:    parseInt(limit),
  });
  const pendingCount = await prisma.evidenceAlert.count({ where: { status: 'pending' } });
  res.json({ alerts, pendingCount });
});

// GET /api/evidence-alerts/:id
router.get('/:id', async (req, res) => {
  const alert = await prisma.evidenceAlert.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ alert });
});

// POST /api/evidence-alerts/:id/approve — queue regeneration of affected chapters
router.post('/:id/approve', async (req, res) => {
  const alert = await prisma.evidenceAlert.findUniqueOrThrow({ where: { id: req.params.id } });

  if (alert.status !== 'pending') {
    res.status(409).json({ error: 'ALREADY_PROCESSED', message: `Alert is already ${alert.status}` });
    return;
  }

  // Queue regeneration for affected chapters
  let queuedChapters = 0;
  for (const bookId of alert.affectedBookIds) {
    const chapters = await prisma.chapter.findMany({
      where:   { bookId, status: { in: ['QA_PASSED', 'GENERATED', 'QA_FAILED'] } },
      orderBy: { chapterNumber: 'asc' },
    });
    for (const chapter of chapters) {
      await chapterQueue.add(
        { chapterId: chapter.id, bookId, reason: alert.description, alertId: alert.id },
        { delay: queuedChapters * 3000 }
      );
      queuedChapters++;
    }
    // Mark book as needing update
    await prisma.book.update({ where: { id: bookId }, data: { needsUpdate: true } });
  }

  await prisma.evidenceAlert.update({
    where: { id: req.params.id },
    data:  { status: 'approved', resolvedAt: new Date() },
  });

  res.json({
    message:        'Alert approved. Regeneration queued.',
    bookCount:      alert.affectedBookIds.length,
    queuedChapters,
  });
});

// POST /api/evidence-alerts/:id/dismiss
router.post('/:id/dismiss', async (req, res) => {
  await prisma.evidenceAlert.update({
    where: { id: req.params.id },
    data:  { status: 'dismissed', resolvedAt: new Date() },
  });
  res.json({ message: 'Alert dismissed' });
});

// POST /api/evidence-alerts/trigger-check — manually run evidence monitor
router.post('/trigger-check', async (_req, res) => {
  const { checkForBoardExamChanges } = await import('../jobs/evidenceMonitor');
  checkForBoardExamChanges().catch(console.error);
  res.json({ message: 'Evidence check triggered — running in background' });
});

export default router;
