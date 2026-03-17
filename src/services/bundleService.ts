import { getOpenAIClient } from '../config/openai';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

// ── REVIEW BOOK ──────────────────────────────────────────────────────────────
export async function generateReviewBook(bookId: string): Promise<void> {
  const book = await prisma.book.findUniqueOrThrow({
    where: { id: bookId },
    include: { chapters: { orderBy: { chapterNumber: 'asc' } } },
  });

  const openai = await getOpenAIClient();
  logger.info('Starting review book generation', { bookId, chapters: book.chapters.length });

  for (const chapter of book.chapters) {
    const prompt = `You are a board exam review specialist for ${book.certificationTrack}.

Based on this chapter title: "${chapter.title}"

Generate a HIGH-YIELD board review section with:
1. Top 10 Must-Know Facts (bold the tested value in each)
2. Rapid Review Table (2 columns: Concept | Key Point)
3. 3 Clinical Vignette summaries (presentation → diagnosis → first step)
4. Common Exam Traps (what students get wrong)
5. Memory Anchor (one sentence that locks the concept)

Style: Better than Kaplan. Denser than UWorld. Board-blueprint aligned.
Format: Clean markdown. No filler. Every line must be testable.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    });

    await prisma.chapter.update({
      where: { id: chapter.id },
      data:  { reviewContent: response.choices[0].message.content },
    });

    logger.info('Review content generated', { bookId, chapterId: chapter.id, chapterNumber: chapter.chapterNumber });
  }

  logger.info('Review book generation complete', { bookId });
}

// ── QUESTION BANK ─────────────────────────────────────────────────────────────
export async function generateQuestionBank(bookId: string, questionsPerChapter = 30): Promise<void> {
  const book = await prisma.book.findUniqueOrThrow({
    where: { id: bookId },
    include: { chapters: { orderBy: { chapterNumber: 'asc' } } },
  });

  const openai = await getOpenAIClient();
  logger.info('Starting question bank generation', { bookId, questionsPerChapter });

  for (const chapter of book.chapters) {
    const prompt = `Generate exactly ${questionsPerChapter} board-style multiple choice questions for:
Provider: ${book.certificationTrack} | Chapter: ${chapter.title} | Country: ${book.country || 'USA'}

Each question MUST follow this EXACT JSON structure in an array:
[
  {
    "question": "A 34-year-old patient presents with...",
    "optionA": "...", "optionB": "...", "optionC": "...", "optionD": "...",
    "correctOption": "B",
    "rationale": "B is correct because... A is wrong because... C is wrong because... D is wrong because...",
    "difficulty": "medium",
    "boardDomain": "Psychopharmacology",
    "questionType": "ancc"
  }
]

Rules: Clinical vignette style. No trick questions. Board-blueprint aligned. Return ONLY the JSON array.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(response.choices[0].message.content!);
    } catch {
      logger.warn('Failed to parse QBank JSON', { bookId, chapterId: chapter.id });
      continue;
    }

    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);

    if (questions.length > 0) {
      await prisma.questionBank.createMany({
        data: questions.map((q: any) => ({
          bookId,
          chapterNumber: chapter.chapterNumber,
          question:      q.question     || '',
          optionA:       q.optionA      || '',
          optionB:       q.optionB      || '',
          optionC:       q.optionC      || '',
          optionD:       q.optionD      || '',
          correctOption: q.correctOption || 'A',
          rationale:     q.rationale    || '',
          difficulty:    q.difficulty   || 'medium',
          boardDomain:   q.boardDomain  || '',
          questionType:  q.questionType || 'ancc',
        })),
        skipDuplicates: true,
      });
    }

    logger.info('Questions generated', { bookId, chapterId: chapter.id, count: questions.length });
  }

  logger.info('Question bank generation complete', { bookId });
}

// ── MNEMONIC BOOK ─────────────────────────────────────────────────────────────
export async function generateMnemonicBook(bookId: string): Promise<void> {
  const book = await prisma.book.findUniqueOrThrow({
    where: { id: bookId },
    include: { chapters: { orderBy: { chapterNumber: 'asc' } } },
  });

  const openai = await getOpenAIClient();
  logger.info('Starting mnemonic book generation', { bookId });

  for (const chapter of book.chapters) {
    const prompt = `Create 50+ mnemonics for: ${chapter.title} (${book.certificationTrack})

Return ONLY a JSON object with a "mnemonics" array:
{
  "mnemonics": [
    {
      "mnemonic": "SIGECAPS",
      "expansion": "Sleep changes, Interest loss, Guilt, Energy decrease, Concentration issues, Appetite changes, Psychomotor changes, Suicidal ideation",
      "topic": "Major Depressive Disorder",
      "bodySystem": "Psychiatric",
      "boardDomain": "Mood Disorders",
      "clinicalNote": "SIGECAPS: ≥5 symptoms present for ≥2 weeks = MDD diagnosis"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 3000,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(response.choices[0].message.content!);
    } catch {
      logger.warn('Failed to parse Mnemonic JSON', { bookId, chapterId: chapter.id });
      continue;
    }

    const mnemonics = Array.isArray(parsed) ? parsed : (parsed.mnemonics || []);

    if (mnemonics.length > 0) {
      await prisma.mnemonicEntry.createMany({
        data: mnemonics.map((m: any) => ({
          bookId,
          mnemonic:    m.mnemonic    || '',
          expansion:   m.expansion   || '',
          topic:       m.topic       || chapter.title,
          bodySystem:  m.bodySystem  || '',
          boardDomain: m.boardDomain || '',
          clinicalNote:m.clinicalNote|| '',
        })),
        skipDuplicates: true,
      });
    }

    logger.info('Mnemonics generated', { bookId, chapterId: chapter.id, count: mnemonics.length });
  }

  logger.info('Mnemonic book generation complete', { bookId });
}

// ── BUNDLE STATUS ─────────────────────────────────────────────────────────────
export async function getBundleStatus(bookId: string) {
  const [qCount, mCount, book] = await Promise.all([
    prisma.questionBank.count({ where: { bookId } }),
    prisma.mnemonicEntry.count({ where: { bookId } }),
    prisma.book.findUnique({
      where: { id: bookId },
      include: { chapters: { select: { reviewContent: true, status: true } } },
    }),
  ]);

  if (!book) throw new Error('Book not found');

  const reviewDone = book.chapters.length > 0 && book.chapters.every(c => c.reviewContent !== null);
  const textbookDone = ['QA_PASSED', 'DESIGN_READY', 'KDP_READY', 'PUBLISHED'].includes(book.status);

  return {
    textbook:   textbookDone ? 'complete' : 'in_progress',
    review:     reviewDone   ? 'complete' : 'pending',
    qbank:      qCount > 0   ? `${qCount} questions` : 'pending',
    mnemonics:  mCount > 0   ? `${mCount} mnemonics` : 'pending',
    picture:    'pending',     // Phase 6
    studysheet: 'pending',     // Phase 6
    counts: { questions: qCount, mnemonics: mCount, chapters: book.chapters.length },
  };
}
