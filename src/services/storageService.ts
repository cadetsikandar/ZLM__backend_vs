import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import { logger } from '../config/logger';

const LOCAL_DIR = path.join(process.cwd(), 'local-storage');

function isS3Configured(): boolean {
  return !!(config.aws.s3Bucket && config.aws.accessKeyId &&
    config.aws.accessKeyId !== 'dummy' && config.aws.secretAccessKey &&
    config.aws.secretAccessKey !== 'dummy');
}

function getS3Client(): S3Client {
  return new S3Client({
    region: config.aws.region,
    credentials: {
      accessKeyId:     config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
    },
  });
}

export async function uploadFile(key: string, content: Buffer | string, contentType = 'application/octet-stream'): Promise<string> {
  if (isS3Configured()) {
    const s3 = getS3Client();
    const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    await s3.send(new PutObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key:    key,
      Body:   body,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }));
    const url = `https://${config.aws.s3Bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
    logger.info('Uploaded to S3', { key });
    return url;
  }

  // Local fallback
  const filePath = path.join(LOCAL_DIR, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  logger.info('Saved locally', { key, path: filePath });
  return `local://${key}`;
}

export async function uploadManuscript(bookId: string, chapterNumber: number, content: Buffer, filename: string): Promise<string> {
  const key = `manuscripts/${bookId}/chapter-${String(chapterNumber).padStart(2,'0')}/${filename}`;
  return uploadFile(key, content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

export async function getPresignedUrl(s3Key: string): Promise<string> {
  if (!isS3Configured()) {
    return `local://${s3Key}`;
  }
  const s3 = getS3Client();
  const command = new GetObjectCommand({ Bucket: config.aws.s3Bucket, Key: s3Key });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function downloadFile(key: string): Promise<Buffer> {
  if (isS3Configured()) {
    const s3 = getS3Client();
    const res = await s3.send(new GetObjectCommand({ Bucket: config.aws.s3Bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as any) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  const filePath = path.join(LOCAL_DIR, key);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${key}`);
  return fs.readFileSync(filePath);
}

export const storageService = { uploadFile, uploadManuscript, getPresignedUrl, downloadFile, isS3Configured };
