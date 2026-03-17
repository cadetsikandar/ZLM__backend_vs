import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path, method: req.method });

  if (err.name === 'ZodError') {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid request data', details: err.errors });
    return;
  }
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') { res.status(409).json({ error: 'CONFLICT', message: 'Record already exists' }); return; }
    if (err.code === 'P2025') { res.status(404).json({ error: 'NOT_FOUND',  message: 'Record not found' });    return; }
  }

  const status  = err.status || err.statusCode || 500;
  const message = status === 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: err.code || 'SERVER_ERROR', message });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` });
}
