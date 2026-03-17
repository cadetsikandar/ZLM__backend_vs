import { Router } from 'express';
import {
  listBooks, getBook, createBook, updateBook, deleteBook,
  triggerToc, generateAllChapters, triggerKdpMetadata,
  triggerReview, triggerQuestions, triggerMnemonics,
  getBundleStatus, backupBook,
} from '../controllers/booksController';
import { authenticate, contentRoles, adminOnly, allRoles } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CRUD
router.get('/',         allRoles,      listBooks);
router.get('/:id',      allRoles,      getBook);
router.post('/',        contentRoles,  createBook);
router.put('/:id',      contentRoles,  updateBook);
router.delete('/:id',   adminOnly,     deleteBook);

// AI Generation — rate limited
router.post('/:id/generate-toc',       aiLimiter, contentRoles, triggerToc);
router.post('/:id/generate-all',       aiLimiter, contentRoles, generateAllChapters);
router.post('/:id/generate-review',    aiLimiter, contentRoles, triggerReview);
router.post('/:id/generate-questions', aiLimiter, contentRoles, triggerQuestions);
router.post('/:id/generate-mnemonics', aiLimiter, contentRoles, triggerMnemonics);
router.post('/:id/kdp-metadata',       aiLimiter, contentRoles, triggerKdpMetadata);
router.post('/:id/backup',             contentRoles, backupBook);

// Bundle status
router.get('/bundle/:id', allRoles, getBundleStatus);

export default router;
