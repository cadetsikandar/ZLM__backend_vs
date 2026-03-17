import OpenAI from 'openai';
import { config } from './env';
import { logger } from './logger';

let openaiClient: OpenAI | null = null;

async function getOpenAIKeyFromSecrets(): Promise<string> {
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: config.aws.region });
    const response = await client.send(new GetSecretValueCommand({ SecretId: 'zlm/openai-api-key' }));
    if (response.SecretString) {
      const secret = JSON.parse(response.SecretString);
      return secret.OPENAI_API_KEY;
    }
    throw new Error('Secret string empty');
  } catch (err: any) {
    logger.warn('AWS Secrets Manager unavailable, falling back to env var', { error: err.message });
    if (!config.openai.apiKey) throw new Error('No OpenAI API key available');
    return config.openai.apiKey;
  }
}

export async function getOpenAIClient(): Promise<OpenAI> {
  if (openaiClient) return openaiClient;

  const apiKey = config.aws.useSecretsManager
    ? await getOpenAIKeyFromSecrets()
    : config.openai.apiKey;

  if (!apiKey) throw new Error('OpenAI API key not configured');

  openaiClient = new OpenAI({ apiKey });
  logger.info('OpenAI client initialized');
  return openaiClient;
}

// Reset client (for testing or key rotation)
export function resetOpenAIClient(): void {
  openaiClient = null;
}
