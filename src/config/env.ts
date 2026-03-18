import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env:  process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  jwt: {
    secret:        process.env.JWT_SECRET        || 'dev-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
    expiresIn:     '15m',
    refreshExpiresIn: '7d',
  },

  openai: {
    apiKey:    process.env.OPENAI_API_KEY || '',
    model:     process.env.OPENAI_MODEL  || 'gpt-4-turbo',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '8000', 10),
  },

  aws: {
    region:          process.env.AWS_REGION           || 'us-east-1',
    s3Bucket:        process.env.AWS_S3_BUCKET_NAME   || '',
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID    || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    useSecretsManager: process.env.USE_AWS_SECRETS_MANAGER === 'true',
  },

  github: {
    token:     process.env.GITHUB_TOKEN      || '',
    repoOwner: process.env.GITHUB_REPO_OWNER || '',
    repoName:  process.env.GITHUB_REPO_NAME  || '',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  queue: {
    tocConcurrency:     parseInt(process.env.TOC_CONCURRENCY     || '2', 10),
    chapterConcurrency: parseInt(process.env.CHAPTER_CONCURRENCY || '3', 10),
    qaConcurrency:      parseInt(process.env.QA_CONCURRENCY      || '3', 10),
  },

  canva: {
    clientId:     process.env.CANVA_CLIENT_ID     || '',
    clientSecret: process.env.CANVA_CLIENT_SECRET || '',
  },

  airtable: {
    apiKey: process.env.AIRTABLE_API_KEY || '',
    baseId: process.env.AIRTABLE_BASE_ID || '',
  },
};

export function validateConfig() {
  const warnings: string[] = [];
  const errors:   string[] = [];

  if (!config.jwt.secret || config.jwt.secret.includes('dev-secret'))
    warnings.push('JWT_SECRET is using dev default — set a strong secret in production');

  if (!config.openai.apiKey && !config.aws.useSecretsManager)
    warnings.push('OPENAI_API_KEY not set — AI generation will fail');

  if (!config.aws.s3Bucket)
    warnings.push('AWS_S3_BUCKET_NAME not set — using local storage fallback');

  if (!config.redis.url || config.redis.url === 'redis://localhost:6379')
    warnings.push('REDIS_URL using localhost — ensure Redis is running');

  if (errors.length > 0) {
    errors.forEach(e => console.error('[CONFIG ERROR]', e));
    if (config.env === 'production') process.exit(1);
  }

  warnings.forEach(w => console.warn('[CONFIG WARN]', w));
}
