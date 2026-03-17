import { getOpenAIClient } from '../config/openai';
import { prisma } from '../config/prisma';
import { logger, aiAuditLogger } from '../config/logger';
import { storageService } from './storageService';
import { githubService } from './githubService';
import { adaptPromptForProvider } from './promptAdapterService';
import { runEditorChecklist } from './editorChecklistService';
import { ChapterStatus, CertificationTrack } from '@prisma/client';

const MIN_WORD_COUNT = 4000;

// ── TOC GENERATION ────────────────────────────────────────────────────────────
export async function generateToc(bookId: string, certificationTrack: string, trackNumber: number) {
  const book = await prisma.book.findUniqueOrThrow({ where: { id: bookId } });
  const openai = await getOpenAIClient();

  const prompt = await getTocPrompt(certificationTrack, trackNumber, book.country || 'USA');

  logger.info('Generating TOC', { bookId, certificationTrack, trackNumber });
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: 'You are an expert medical textbook curriculum designer.' },
      { role: 'user',   content: prompt },
    ],
  });

  const tocText = response.choices[0].message.content || '';
  aiAuditLogger.info('TOC generated', { bookId, tokens: response.usage });

  // Parse chapters from TOC
  const chapterLines = tocText.match(/^(?:Chapter\s+)?(\d+)[.:]\s*(.+)$/gm) || [];
  const chapters: Array<{ number: number; title: string }> = [];

  for (const line of chapterLines.slice(0, 20)) {
    const match = line.match(/^(?:Chapter\s+)?(\d+)[.:]\s*(.+)$/);
    if (match) chapters.push({ number: parseInt(match[1]), title: match[2].trim() });
  }

  // Fallback to default chapters if parsing fails
  if (chapters.length < 5) {
    const defaults = getDefaultChapters(certificationTrack);
    chapters.push(...defaults);
  }

  // Create chapter records
  const created = await Promise.all(
    chapters.map(ch =>
      prisma.chapter.upsert({
        where:  { bookId_chapterNumber: { bookId, chapterNumber: ch.number } },
        update: { title: ch.title },
        create: { bookId, chapterNumber: ch.number, title: ch.title, status: ChapterStatus.PENDING },
      })
    )
  );

  // Update book
  await prisma.book.update({
    where: { id: bookId },
    data: {
      totalChapters: created.length,
      githubBranch: `track-${certificationTrack.toLowerCase()}-book-${trackNumber}`,
      s3Folder: `manuscripts/${certificationTrack.toLowerCase()}/book-${trackNumber}/`,
    },
  });

  // Save TOC to S3/local
  await storageService.uploadFile(
    `manuscripts/${certificationTrack.toLowerCase()}/book-${trackNumber}/toc.md`,
    tocText,
    'text/markdown'
  );

  logger.info('TOC generation complete', { bookId, chaptersCreated: created.length });
  return created;
}

// ── CHAPTER GENERATION ────────────────────────────────────────────────────────
export async function generateChapter(chapterId: string): Promise<any> {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { book: true },
  });

  const book   = chapter.book;
  const openai = await getOpenAIClient();

  await prisma.chapter.update({ where: { id: chapterId }, data: { status: ChapterStatus.GENERATING } });

  // Get active chapter prompt
  const promptTemplate = await prisma.prompt.findFirst({
    where: { type: 'CHAPTER', isActive: true },
    orderBy: { version: 'desc' },
  });

  const basePrompt = promptTemplate?.content || getDefaultChapterPrompt();
  const filledPrompt = basePrompt
    .replace(/\{\{certificationTrack\}\}/g, book.certificationTrack)
    .replace(/\{\{chapterNumber\}\}/g,      String(chapter.chapterNumber))
    .replace(/\{\{chapterTitle\}\}/g,       chapter.title)
    .replace(/\{\{trackNumber\}\}/g,        String(book.trackNumber));

  const adaptedPrompt = adaptPromptForProvider(filledPrompt, book.certificationTrack, book.country || 'USA');

  const systemPrompt = `You are an expert NP/DNP academic textbook author with 20+ years of clinical and academic experience.
You write rigorous, board-aligned graduate-level content at Harrison's Principles of Internal Medicine depth.
Every chapter must be evidence-based, APA 7th edition compliant, and contain 20-30 in-text citations.`;

  logger.info('Starting chapter generation', { chapterId, chapterTitle: chapter.title });

  // Part 1 (first half of chapter)
  const part1Prompt = `${adaptedPrompt}\n\nWrite the first half of this chapter: sections 1 through 4. Aim for 2,500+ words.`;
  const response1 = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    max_tokens: 7000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: part1Prompt },
    ],
  });
  const part1 = response1.choices[0].message.content || '';
  aiAuditLogger.info('Chapter part 1 complete', { chapterId, words: part1.split(/\s+/).length, tokens: response1.usage });

  // Part 2 (second half)
  const part2Prompt = `Continue writing the chapter "${chapter.title}". Write the remaining sections (5 through end), including Exam-Relevant Pearls, Clinical Case Study, Chapter Summary, Future Findings, and References. Aim for 2,500+ more words.`;
  const response2 = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    max_tokens: 7000,
    messages: [
      { role: 'system',    content: systemPrompt },
      { role: 'user',      content: part1Prompt },
      { role: 'assistant', content: part1 },
      { role: 'user',      content: part2Prompt },
    ],
  });
  const part2 = response2.choices[0].message.content || '';
  aiAuditLogger.info('Chapter part 2 complete', { chapterId, words: part2.split(/\s+/).length, tokens: response2.usage });

  let fullContent = part1 + '\n\n' + part2;
  let wordCount   = fullContent.split(/\s+/).filter(Boolean).length;

  // Extension if under minimum
  if (wordCount < MIN_WORD_COUNT) {
    logger.warn('Chapter under minimum — generating extension', { chapterId, wordCount });
    const ext = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      max_tokens: 4000,
      messages: [
        { role: 'system',    content: systemPrompt },
        { role: 'user',      content: part1Prompt },
        { role: 'assistant', content: part1 },
        { role: 'user',      content: part2Prompt },
        { role: 'assistant', content: part2 },
        { role: 'user',      content: `The chapter is only ${wordCount} words — expand to reach ${MIN_WORD_COUNT}. Add more clinical detail, additional citations, and expand the case study.` },
      ],
    });
    fullContent += '\n\n' + (ext.choices[0].message.content || '');
    wordCount = fullContent.split(/\s+/).filter(Boolean).length;
  }

  // Save to storage
  const padded     = String(chapter.chapterNumber).padStart(2, '0');
  const s3Key      = `${book.s3Folder || `manuscripts/${book.certificationTrack.toLowerCase()}/book-${book.trackNumber}/`}chapters/chapter-${padded}.md`;
  const storageUrl = await storageService.uploadFile(s3Key, fullContent, 'text/markdown');

  // Commit to GitHub
  let commitSha: string | undefined;
  try {
    const branch = book.githubBranch || `track-${book.certificationTrack.toLowerCase()}-book-${book.trackNumber}`;
    commitSha = await githubService.commitChapter(branch, chapter.chapterNumber, chapter.title, fullContent);
  } catch (err: any) {
    logger.warn('GitHub commit failed (non-fatal)', { chapterId, error: err.message });
  }

  // Update chapter record
  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      status:          ChapterStatus.GENERATED,
      wordCount,
      contentS3Key:    storageUrl,
      githubCommitSha: commitSha,
      generatedAt:     new Date(),
    },
  });

  // Update completed count on book
  const completedCount = await prisma.chapter.count({
    where: { bookId: chapter.bookId, status: { in: ['GENERATED', 'QA_PASSED', 'QA_FAILED'] } },
  });
  await prisma.book.update({ where: { id: chapter.bookId }, data: { completedChapters: completedCount } });

  // Run editor checklist automatically
  try { await runEditorChecklist(chapterId); } catch {}

  logger.info('Chapter generation complete', { chapterId, wordCount, storageUrl });
  return { chapterId, wordCount, storageUrl, commitSha };
}

// ── TERMINOLOGY GENERATION ────────────────────────────────────────────────────
export async function generateTerminology(chapterId: string, bookId: string) {
  const [chapter, book] = await Promise.all([
    prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } }),
    prisma.book.findUniqueOrThrow({ where: { id: bookId } }),
  ]);

  const openai = await getOpenAIClient();
  const prompt = `Create a comprehensive Quick Dictionary (terminology section) of 50+ terms for:
Chapter: ${chapter.title} | Provider: ${book.certificationTrack}

Format each term as:
**Term** — Definition (2-3 sentences). Include clinical relevance.

Minimum 3,000 words. Start with the most frequently tested terms on board exams.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    max_tokens: 4000,
    messages: [
      { role: 'system', content: 'You are an expert medical terminology author.' },
      { role: 'user',   content: prompt },
    ],
  });

  const content   = response.choices[0].message.content || '';
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const key = `${book.s3Folder || ''}chapters/chapter-${String(chapter.chapterNumber).padStart(2,'0')}-terminology.md`;

  await storageService.uploadFile(key, content, 'text/markdown');
  logger.info('Terminology generated', { chapterId, wordCount });
  return { wordCount, content };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function getTocPrompt(track: string, bookNum: number, country: string): Promise<string> {
  const tmpl = await prisma.prompt.findFirst({ where: { type: 'TOC', isActive: true } });
  if (tmpl) {
    return tmpl.content
      .replace(/\{\{certificationTrack\}\}/g, track)
      .replace(/\{\{trackNumber\}\}/g,        String(bookNum))
      .replace(/\{\{country\}\}/g,            country);
  }

  return `Generate a detailed Table of Contents for a graduate-level ${track} certification textbook.
Book ${bookNum} of 4 in the series. Country: ${country}.

Create 18-20 chapters covering all major topics tested on the ${track} board exam.
Format each line as: "Chapter N: Title"
Include foundational, clinical, and advanced topics.`;
}

function getDefaultChapterPrompt(): string {
  return `Write Chapter {{chapterNumber}}: "{{chapterTitle}}" for a {{certificationTrack}} NP/DNP certification textbook (Book {{trackNumber}}).

MANDATORY SECTIONS — ALL REQUIRED:
## Chapter Overview (300+ words)
## Learning Objectives (6-8 measurable Bloom's taxonomy objectives)
## [Main Content sections with clinical detail]
## Exam-Relevant Pearls (10-15 ANCC board exam pearls)
## Clinical Case Study (500+ words, realistic patient case)
## Chapter Summary (350+ words)
## Future Findings (emerging research, upcoming guideline changes)
## References (minimum 10 APA 7th edition references)

Requirements: Harrison-depth content. 20-30 in-text APA citations. Generic Name (Brand Name) for all medications.
Minimum word count: 4,500 words. Board-exam aligned.`;
}

function getDefaultChapters(track: string): Array<{ number: number; title: string }> {
  const defaults: Record<string, string[]> = {
    PMHNP: [
      'Advanced Psychopathology & Neurobiological Foundations',
      'Psychiatric Assessment & Diagnostic Formulation',
      'Psychopharmacology: Mechanisms & Clinical Application',
      'Major Depressive Disorder & Treatment Strategies',
      'Bipolar Spectrum Disorders',
      'Anxiety Disorders & OCD Spectrum',
      'Trauma-Related & Stressor Disorders',
      'Schizophrenia Spectrum & Psychotic Disorders',
      'Substance Use Disorders & Addiction Medicine',
      'Neurocognitive Disorders & Dementia',
      'Child & Adolescent Psychiatry',
      'Psychotherapy Modalities & Evidence-Based Practice',
      'Crisis Intervention & Suicide Risk Assessment',
      'Personality Disorders',
      'Sleep Disorders',
      'Somatic Symptom & Related Disorders',
      'Special Populations: Geriatric Psychiatry',
      'Legal & Ethical Issues in Psychiatric Practice',
    ],
    FNP: [
      'Advanced Pathophysiology for Family Practice',
      'Advanced Health Assessment & Clinical Reasoning',
      'Advanced Pharmacology & Prescribing Principles',
      'Cardiovascular Disorders in Primary Care',
      'Pulmonary Disorders in Primary Care',
      'Gastrointestinal & Hepatic Disorders',
      'Endocrine & Metabolic Disorders',
      'Musculoskeletal & Rheumatologic Conditions',
      'Neurological Disorders in Primary Care',
      "Women's Health & Gynecology",
      "Men's Health",
      'Pediatric Primary Care',
      'Geriatric Primary Care',
      'Dermatology in Primary Care',
      'Mental Health in Primary Care',
      'Infectious Diseases & Immunizations',
      'Preventive Care & Health Promotion',
      'Chronic Disease Management',
    ],
  };

  const titles = defaults[track] || defaults['FNP'];
  return titles.map((title, i) => ({ number: i + 1, title }));
}

export const manuscriptService = { generateToc, generateChapter, generateTerminology };
