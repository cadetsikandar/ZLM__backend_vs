import { getOpenAIClient } from '../config/openai';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

export interface KDPMetadata {
  title:        string;
  subtitle:     string;
  description:  string;
  keywords:     string[];
  bisacCode:    string;
  bisacCategory:string;
  language:     string;
  pages:        number;
  authorName:   string;
}

export async function generateKDPMetadata(bookId: string): Promise<KDPMetadata> {
  const book = await prisma.book.findUniqueOrThrow({
    where: { id: bookId },
    include: { chapters: { take: 3, select: { title: true } } },
  });

  const openai = await getOpenAIClient();

  const prompt = `You are an Amazon KDP publishing expert and medical book SEO specialist.

Generate optimized KDP metadata for this medical textbook series:
Provider Type: ${book.certificationTrack}
Book Number: ${book.trackNumber} of 4
Bundle Type: ${book.bundleType || 'TEXTBOOK'}
Country: ${book.country || 'USA'}
Board Exam: ${book.boardExam || 'ANCC'}
Sample Chapters: ${book.chapters.map(c => c.title).join(', ')}

Return ONLY valid JSON:
{
  "title": "SEO-optimized title starting with provider acronym",
  "subtitle": "Descriptive subtitle with board exam name and year",
  "description": "250-word book description optimized for Amazon (HTML bold tags allowed)",
  "keywords": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7"],
  "bisacCode": "MED028000",
  "bisacCategory": "MEDICAL / Nursing / General",
  "language": "en",
  "pages": 700,
  "authorName": "Zarwango-Lubega-Muyizzi Publishing"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  const metadata = JSON.parse(response.choices[0].message.content!) as KDPMetadata;

  await prisma.book.update({
    where: { id: bookId },
    data: {
      seoTitle:    metadata.title,
      kdpTitle:    metadata.title,
      kdpSubtitle: metadata.subtitle,
      kdpDescription: metadata.description,
      kdpKeywords: metadata.keywords,
      kdpMetadata: JSON.stringify(metadata),
    },
  });

  logger.info('KDP metadata generated', { bookId, title: metadata.title });
  return metadata;
}
