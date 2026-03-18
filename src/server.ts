import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, validateConfig } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { errorHandler, notFound } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';
import { closeQueues } from './queues';
import { startEvidenceMonitor } from './jobs/evidenceMonitor';

// Routes
import authRouter          from './routes/auth';
import booksRouter         from './routes/books';
import chaptersRouter      from './routes/chapters';
import dashboardRouter     from './routes/dashboard';
import examMatchingRouter  from './routes/examMatching';
import promptsRouter       from './routes/prompts';
import usersRouter         from './routes/users';
import brandingRouter      from './routes/branding';
import evidenceAlertsRouter from './routes/evidenceAlerts';

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = [
      config.frontendUrl,
      'http://localhost:3000',
      'http://localhost:3001',
    ].filter(Boolean);
    // Also allow any vercel.app domain for previews
    if (allowed.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.railway.app')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(generalLimiter);

// ── Health endpoint (public — used by Railway, Sidebar health check) ──────────
app.get('/health', async (_req, res) => {
  let dbStatus = 'offline';
  try { await prisma.$queryRaw`SELECT 1`; dbStatus = 'connected'; } catch {}

  const s3Configured = !!(
    process.env.AWS_S3_BUCKET_NAME &&
    process.env.AWS_ACCESS_KEY_ID  &&
    process.env.AWS_ACCESS_KEY_ID !== 'dummy'
  );

  res.json({
    status:    dbStatus === 'connected' ? 'healthy' : 'degraded',
    version:   process.env.npm_package_version || '2.0.0',
    uptime:    Math.round(process.uptime()),
    db:        dbStatus,
    redis:     'connected',        // Bull would throw on startup if Redis unavailable
    openai:    process.env.OPENAI_API_KEY || process.env.USE_AWS_SECRETS_MANAGER === 'true' ? 'configured' : 'not_configured',
    github:    process.env.GITHUB_TOKEN ? 'configured' : 'dev',
    s3:        s3Configured ? 'connected' : 'local',
    secrets:   process.env.USE_AWS_SECRETS_MANAGER === 'true' ? 'configured' : 'env_only',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',             authRouter);
app.use('/api/books',            booksRouter);
app.use('/api/chapters',         chaptersRouter);
app.use('/api/dashboard',        dashboardRouter);
app.use('/api/prompts',          promptsRouter);
app.use('/api/users',            usersRouter);
app.use('/api/branding',         brandingRouter);
app.use('/api/evidence-alerts',  evidenceAlertsRouter);

// Exam matching routes (public-facing for NewBook wizard)
app.use('/api',                  examMatchingRouter);   // /api/providers, /api/countries, /api/match-exam
app.use('/api/exam-matching',    examMatchingRouter);   // also at /api/exam-matching/*

// ── 404 + error handling ──────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
async function bootstrap() {
  validateConfig();

  // Test DB connection
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (err: any) {
    logger.error('Database connection failed', { error: err.message });
    if (config.env === 'production') process.exit(1);
  }

  // Start evidence monitor (Phase 7)
  if (config.env === 'production') {
    startEvidenceMonitor();
  }

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`ZLM Backend running`, {
      port:    config.port,
      env:     config.env,
      version: '2.0.0',
    });
    logger.info(`Health check: http://localhost:${config.port}/health`);
    logger.info(`API base:     http://localhost:${config.port}/api`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await closeQueues();
      await prisma.$disconnect();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => { logger.error('Forced shutdown after 30s'); process.exit(1); }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException',  (err) => { logger.error('Uncaught exception',  { error: err.message, stack: err.stack }); });
  process.on('unhandledRejection', (err: any) => { logger.error('Unhandled rejection', { error: err?.message }); });
}

bootstrap();

export default app;
