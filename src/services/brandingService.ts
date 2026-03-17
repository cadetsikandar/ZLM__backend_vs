import { getOpenAIClient } from '../config/openai';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

export async function generateBrandingConfig(providerType: string): Promise<any> {
  // Return existing if already generated
  const existing = await prisma.brandingConfig.findUnique({ where: { providerType } });
  if (existing) return existing;

  const openai = await getOpenAIClient();

  const prompt = `You are a medical publishing brand designer at a professional publishing house.

Generate a professional color palette and brand identity for a medical textbook series for:
Provider Type: ${providerType}

Consider:
- The clinical specialty and its emotional associations
- The typical demographics of students in this field  
- Professional medical publishing standards
- Colors that convey competence, trust, and specialization
- How this series should differ visually from other medical textbooks

Return ONLY valid JSON:
{
  "primaryColor":   "#HEX (main brand color)",
  "secondaryColor": "#HEX (supporting color)",
  "accentColor":    "#HEX (highlight/CTA color)",
  "fontPairing":    "Display Font / Body Font",
  "coverStyle":     "clinical|academic|modern|warm",
  "seriesName":     "ZLM ${providerType} Series",
  "aiReasoning":    "1-2 sentences explaining why these colors and style suit this specialty"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 500,
  });

  const cfg = JSON.parse(response.choices[0].message.content!);

  const saved = await prisma.brandingConfig.create({
    data: {
  providerType,
  primaryColor:   cfg.primaryColor   || '#1B3A6B',
  secondaryColor: cfg.secondaryColor || '#2E5FA3',
  accentColor:    cfg.accentColor    || '#E8A838',
  fontPairing:    cfg.fontPairing    || 'Source Sans Pro / Atkinson Hyperlegible',
  coverStyle:     cfg.coverStyle     || 'clinical',
  seriesName:     cfg.seriesName     || `ZLM ${providerType} Series`,
  aiReasoning:    cfg.aiReasoning,
  },
  });

  logger.info('Branding config generated', { providerType, primaryColor: cfg.primaryColor });
  return saved;
}

export async function getBrandingConfig(providerType: string): Promise<any> {
  let config = await prisma.brandingConfig.findUnique({ where: { providerType } });
  if (!config) config = await generateBrandingConfig(providerType);
  return config;
}
