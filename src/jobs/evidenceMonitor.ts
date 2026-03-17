import cron from 'node-cron';
import { getOpenAIClient } from '../config/openai';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

// Run every day at 2:00 AM UTC
export function startEvidenceMonitor(): void {
  cron.schedule('0 2 * * *', async () => {
    logger.info('[EvidenceMonitor] Starting daily board exam change check');
    try {
      await checkForBoardExamChanges();
    } catch (err: any) {
      logger.error('[EvidenceMonitor] Daily check failed', { error: err.message });
    }
  });
  logger.info('[EvidenceMonitor] Scheduled — runs daily at 02:00 UTC');
}

export async function checkForBoardExamChanges(): Promise<number> {
  const openai = await getOpenAIClient();

  const mappings = await prisma.boardExamMapping.findMany({ where: { isActive: true } });
  const examList = [...new Set(mappings.map(m => m.boardExam))].join(', ');

  if (!examList) { logger.info('[EvidenceMonitor] No board exam mappings found'); return 0; }

  const today = new Date().toISOString().split('T')[0];
  const prompt = `You are a medical education monitoring system with knowledge of board exam updates.

Today is ${today}. Check if there are any significant recent updates (last 90 days) to these board exams: ${examList}

Consider: blueprint changes, new content domains, removed topics, format changes, passing score updates.

Return ONLY valid JSON with an "alerts" array (empty array if no updates found):
{
  "alerts": [
    {
      "title": "Brief title of the change",
      "source": "ANCC",
      "description": "What changed and why it matters for students",
      "affectedTracks": ["PMHNP"],
      "severity": "critical|major|minor"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  let alerts: any[] = [];
  try {
    const parsed = JSON.parse(response.choices[0].message.content!);
    alerts = Array.isArray(parsed) ? parsed : (parsed.alerts || []);
  } catch (err: any) {
    logger.warn('[EvidenceMonitor] Failed to parse AI response', { error: err.message });
    return 0;
  }

  let created = 0;
  for (const alert of alerts) {
    try {
      // Find affected books
      const affectedBooks = await prisma.book.findMany({
        where: { certificationTrack: { in: alert.affectedTracks || [] } },
        select: { id: true },
      });
      const affectedBookIds = affectedBooks.map(b => b.id);

      await prisma.evidenceAlert.create({
        data: {
          title:           alert.title       || 'Board Exam Update',
          source:          alert.source      || 'Unknown',
          description:     alert.description || '',
          affectedTracks:  alert.affectedTracks || [],
          affectedBookIds,
          severity:        alert.severity    || 'minor',
          status:          'pending',
        },
      });

      // Mark critical/major affected books as needing update
      if (['critical', 'major'].includes(alert.severity) && affectedBookIds.length > 0) {
        await prisma.book.updateMany({
          where: { id: { in: affectedBookIds } },
          data:  { needsUpdate: true },
        });
      }

      created++;
      logger.info('[EvidenceMonitor] Alert created', { title: alert.title, severity: alert.severity });
    } catch (err: any) {
      logger.error('[EvidenceMonitor] Failed to save alert', { error: err.message });
    }
  }

  logger.info(`[EvidenceMonitor] Complete — ${created} alerts created`);
  return created;
}
