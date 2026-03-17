import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

export interface ChecklistFlag {
  chapterId:    string;
  chapterTitle: string;
  severity:     'critical' | 'warning' | 'info';
  flag:         string;
  detail:       string;
}

const REQUIRED_SECTIONS = [
  'Chapter Overview',
  'Learning Objectives',
  'Exam-Relevant Pearls',
  'Clinical Case Study',
  'Chapter Summary',
  'References',
  'Future Findings',
];

export async function runEditorChecklist(chapterId: string): Promise<ChecklistFlag[]> {
  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });

  // Load content from storage if not inline
  let content = '';
  if (chapter.contentS3Key) {
    try {
      const { storageService } = await import('./storageService');
      const buf = await storageService.downloadFile(chapter.contentS3Key.replace(/^local:\/\//, '').replace(/^https?:\/\/[^/]+\//, ''));
      content = buf.toString('utf8');
    } catch {
      logger.warn('Could not load chapter content for checklist', { chapterId });
    }
  }

  const flags: ChecklistFlag[] = [];
  const flag = (severity: 'critical' | 'warning' | 'info', f: string, detail: string) =>
    flags.push({ chapterId, chapterTitle: chapter.title, severity, flag: f, detail });

  // ── CRITICAL CHECKS ──────────────────────────────────────────────────────
  // Required sections
  for (const section of REQUIRED_SECTIONS) {
    if (content && !content.toLowerCase().includes(section.toLowerCase())) {
      flag('critical', `Missing section: ${section}`, `Required section "${section}" not found in chapter`);
    }
  }

  // Citation count
  if (content) {
    const apaPattern = /\([A-Z][a-z]+[^)]*,\s*\d{4}[a-z]?\)/g;
    const citations = content.match(apaPattern) || [];
    if (citations.length < 20) {
      flag('critical', `Low citations: ${citations.length}/20`,
        `Chapter has only ${citations.length} in-text citations. Minimum is 20.`);
    }
  }

  // Word count
  if (chapter.wordCount && chapter.wordCount < 3500) {
    flag('critical', `Low word count: ${chapter.wordCount}`,
      `Chapter is ${chapter.wordCount.toLocaleString()} words. Minimum target is 4,000.`);
  }

  // QA score
  if (chapter.qaScore !== null && Number(chapter.qaScore) < 70) {
    flag('critical', `Low QA score: ${Math.round(Number(chapter.qaScore))}%`,
      `Chapter QA score is ${Math.round(Number(chapter.qaScore))}%. Must be ≥70% to pass.`);
  }

  // Failed QA
  if (chapter.status === 'QA_FAILED') {
    flag('critical', 'QA failed', 'Chapter failed QA audit and requires regeneration or manual fix.');
  }

  // ── WARNING CHECKS ────────────────────────────────────────────────────────
  // Medication format (Generic Name (Brand Name))
  if (content && !content.match(/[A-Z][a-z]+\s+\([A-Z][a-z]+\)/)) {
    flag('warning', 'Medication format',
      'No medications found in "Generic Name (Brand Name)" format. Verify if chapter requires medications.');
  }

  // Over-bolding
  if (content && (content.match(/\*\*[^*]{200,}\*\*/g) || []).length > 0) {
    flag('warning', 'Over-bolding detected',
      'Long bolded passages found. Bold should be selective, not entire paragraphs.');
  }

  // Recent citations (basic check - last 4 years)
  if (content) {
    const currentYear = new Date().getFullYear();
    const recentYears = [currentYear, currentYear-1, currentYear-2, currentYear-3].map(String);
    const hasRecent = recentYears.some(y => content.includes(y));
    if (!hasRecent && content.length > 500) {
      flag('warning', 'No recent citations',
        'No citations from the last 4 years detected. Minimum 15 recent citations required.');
    }
  }

  // ── INFO CHECKS ───────────────────────────────────────────────────────────
  if (chapter.status === 'PENDING') {
    flag('info', 'Not yet generated', 'Chapter slot exists but content has not been generated yet.');
  }

  // Save flags to DB
  try {
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        editorFlags:     JSON.stringify(flags),
        hasEditorIssues: flags.some(f => f.severity === 'critical'),
      },
    });
  } catch (err: any) {
    logger.warn('Could not save editor flags to DB', { chapterId, error: err.message });
  }

  logger.info('Editor checklist complete', {
    chapterId,
    critical: flags.filter(f => f.severity === 'critical').length,
    warning:  flags.filter(f => f.severity === 'warning').length,
  });

  return flags;
}

export async function getEditorFlags(chapterId: string): Promise<ChecklistFlag[]> {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter?.editorFlags) return [];
  try { return JSON.parse(chapter.editorFlags); }
  catch { return []; }
}

export async function getBookEditorFlags(bookId: string): Promise<ChecklistFlag[]> {
  const chapters = await prisma.chapter.findMany({
    where:   { bookId },
    orderBy: { chapterNumber: 'asc' },
  });

  const allFlags: ChecklistFlag[] = [];
  for (const ch of chapters) {
    if (ch.editorFlags) {
      try { allFlags.push(...JSON.parse(ch.editorFlags)); } catch {}
    }
  }
  return allFlags;
}
