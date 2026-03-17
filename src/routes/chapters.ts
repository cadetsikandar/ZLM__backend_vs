import { Router } from 'express';
import {
  listChapters, getChapter, triggerChapterGeneration,
  triggerQA, getQaReport, downloadChapter,
  clearChapter, deleteChapter, addChapter, getEditorFlags,
} from '../controllers/chaptersController';
import { authenticate, contentRoles, qaRoles, adminOnly, allRoles } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

router.get('/',                     allRoles,     listChapters);
router.get('/:id',                  allRoles,     getChapter);
router.get('/:id/qa-report',        allRoles,     getQaReport);
router.get('/:id/download',         allRoles,     downloadChapter);
router.get('/:id/editor-flags',     allRoles,     getEditorFlags);

router.post('/:id/generate',        aiLimiter, contentRoles, triggerChapterGeneration);
router.post('/:id/qa',              aiLimiter, qaRoles,      triggerQA);
router.post('/:id/clear',           contentRoles, clearChapter);
router.delete('/:id',               adminOnly,    deleteChapter);

// Add chapter to a book
router.post('/book/:bookId',        contentRoles, addChapter);

export default router;
