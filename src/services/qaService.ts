import { getOpenAIClient } from '../config/openai';
import { prisma } from '../config/prisma';
import { logger, aiAuditLogger } from '../config/logger';
import { storageService } from './storageService';
import { ChapterStatus } from '@prisma/client';

const PASS_THRESHOLD = 70;

export async function runQA(chapterId: string, strictMode = true): Promise<any> {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where:   { id: chapterId },
    include: { book: true },
  });

  await prisma.chapter.update({ where: { id: chapterId }, data: { status: ChapterStatus.QA_PENDING } });

  // Load content
  let content = '';
  if (chapter.contentS3Key) {
    try {
      const key = chapter.contentS3Key.replace(/^local:\/\//, '').replace(/^https?:\/\/[^/]+\//, '');
      const buf = await storageService.downloadFile(key);
      content   = buf.toString('utf8');
    } catch (err: any) {
      logger.warn('Could not load chapter content for QA', { chapterId, error: err.message });
    }
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  // Pre-flight compliance check
  const preFlightResult = runPreFlight(content, chapter.title, chapter.chapterNumber, wordCount);

  // AI QA audit
  let aiResult: any = {};
  try {
    const openai = await getOpenAIClient();
    const prompt = buildQAPrompt(chapter.title, chapter.book.certificationTrack, content.slice(0, 8000), strictMode);

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: 'You are a medical textbook QA auditor. Evaluate APA compliance, clinical accuracy, board alignment, and academic quality. Return structured JSON only.' },
        { role: 'user',   content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    aiAuditLogger.info('QA AI response received', { chapterId, tokens: response.usage });

    try {
      aiResult = JSON.parse(response.choices[0].message.content || '{}');
    } catch {
      aiResult = {};
    }
  } catch (err: any) {
    logger.warn('AI QA call failed — using pre-flight only', { chapterId, error: err.message });
    aiResult = { aiCallFailed: true };
  }

  // Combine scores
  const preFlightScore = preFlightResult.score;
  const aiScore        = aiResult.overallScore || preFlightScore;
  const overallScore   = Math.round((preFlightScore * 0.4) + (aiScore * 0.6));
  const passed         = overallScore >= PASS_THRESHOLD;

  // Save QA report
  const report = await prisma.qaReport.create({
    data: {
      chapterId,
      apaViolations:       preFlightResult.apaViolations,
      boldGovernanceIssues:preFlightResult.boldIssues,
      redundancyFlags:     preFlightResult.redundancyFlags,
      medicationErrors:    preFlightResult.medicationErrors,
      structureIssues:     preFlightResult.structureIssues,
      depthScore:          aiResult.depthScore     || preFlightScore,
      citationCount:       preFlightResult.citationCount,
      recentCitations:     preFlightResult.recentCitations,
      overallScore,
      passed,
      rawQaResponse: JSON.stringify({
        executiveSummary: aiResult.executiveSummary || `Chapter scored ${overallScore}/100.`,
        recommendedFixes: aiResult.recommendedFixes || [],
        preFlightResult,
        strictMode,
        aiCallFailed: aiResult.aiCallFailed || false,
      }),
      strictMode,
    },
  });

  // Update chapter
  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      status:   passed ? ChapterStatus.QA_PASSED : ChapterStatus.QA_FAILED,
      qaScore:  overallScore,
    },
  });

  // Update book QA average
  await updateBookQaScore(chapter.bookId);

  logger.info('QA complete', { chapterId, overallScore, passed });

  if (!passed && chapter.retryCount < 1) {
    logger.info('Scheduling auto-resubmit for failed chapter', { chapterId });
    setTimeout(async () => {
      try {
        const { chapterQueue } = await import('../queues');
        await chapterQueue.add({ chapterId, bookId: chapter.bookId, isAutoResubmit: true },
          { delay: 30000, attempts: 1 });
      } catch {}
    }, 5000);
  }

  return { reportId: report.id, overallScore, passed,
    violations: {
      apa:        preFlightResult.apaViolations.length,
      bold:       preFlightResult.boldIssues.length,
      redundancy: preFlightResult.redundancyFlags.length,
    }
  };
}

function runPreFlight(content: string, title: string, chapterNum: number, wordCount: number) {
  const apaViolations:  any[] = [];
  const boldIssues:     any[] = [];
  const redundancyFlags:any[] = [];
  const medicationErrors:any[]= [];
  const structureIssues:string[]=[];

  // Citation check
  const citations = (content.match(/\([A-Z][a-z]+[^)]*,\s*\d{4}[a-z]?\)/g) || []).length +
                    (content.match(/[A-Z][a-z]+\s+(?:et al\.)?\s*\(\d{4}\)/g) || []).length;
  if (citations < 8) {
    apaViolations.push({ line: `${citations} citations found`, issue: `Insufficient citations — ${citations} found, minimum 8 required`, suggestion: 'Add (Author, Year) citations throughout' });
  }

  // Word count
  let score = 100;
  if (wordCount < 3000)  { score -= 30; structureIssues.push(`Very low word count: ${wordCount}`); }
  else if (wordCount < 4000) { score -= 15; }

  // Required sections
  const required = ['Exam-Relevant Pearls', 'References', 'Chapter Summary'];
  for (const sec of required) {
    if (!content.toLowerCase().includes(sec.toLowerCase())) {
      score -= 10;
      structureIssues.push(`Missing section: ${sec}`);
    }
  }

  // Penalties for violations
  score -= Math.min(apaViolations.length * 5, 20);
  score -= Math.min(structureIssues.length * 5, 20);

  // Recent citations (last 4 years)
  const year = new Date().getFullYear();
  const recentYears = [year, year-1, year-2, year-3].map(String);
  const recentCitations = recentYears.filter(y => content.includes(y)).length > 0 ? Math.ceil(citations * 0.4) : 0;

  return {
    score:       Math.max(0, Math.min(100, score)),
    apaViolations, boldIssues, redundancyFlags, medicationErrors, structureIssues,
    citationCount: citations,
    recentCitations,
    passesPreFlight: score >= 70,
  };
}

function buildQAPrompt(title: string, track: string, content: string, strict: boolean): string {
  return `You are a medical textbook QA auditor reviewing a ${track} chapter titled "${title}".

Evaluate this chapter content (first 8000 chars shown):
${content}

Provide a JSON audit report:
{
  "overallScore": 0-100,
  "depthScore": 0-100,
  "executiveSummary": "2-3 sentence assessment",
  "recommendedFixes": ["specific fix 1", "specific fix 2", ...],
  "apaCompliance": "pass|fail",
  "clinicalAccuracy": "pass|fail",
  "boardAlignment": "pass|fail",
  "academicTone": "pass|fail"
}

Scoring: 90-100=Excellent, 80-89=Good, 70-79=Acceptable, <70=Fail`;
}

async function updateBookQaScore(bookId: string): Promise<void> {
  try {
    const chapters = await prisma.chapter.findMany({ where: { bookId, qaScore: { not: null } }, select: { qaScore: true } });
    if (!chapters.length) return;
    const avg = chapters.reduce((s, c) => s + Number(c.qaScore), 0) / chapters.length;
    await prisma.book.update({ where: { id: bookId }, data: { overallQaScore: avg } });
  } catch {}
}

export async function getReport(chapterId: string) {
  const report = await prisma.qaReport.findFirst({ where: { chapterId }, orderBy: { createdAt: 'desc' } });
  if (!report) throw new Error('No QA report found');
  let extra: any = {};
  try { if (report.rawQaResponse) extra = JSON.parse(report.rawQaResponse); } catch {}
  return { ...report, executiveSummary: extra.executiveSummary, recommendedFixes: extra.recommendedFixes || [] };
}

export const qaService = { runQA, getReport };
