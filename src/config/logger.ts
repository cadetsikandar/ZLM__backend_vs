import winston from 'winston';

const fmt = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fmt,
  transports: [
    new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), fmt) }),
  ],
});

export const aiAuditLogger = winston.createLogger({
  level: 'info',
  format: fmt,
  defaultMeta: { service: 'ai-audit' },
  transports: [new winston.transports.Console()],
});
