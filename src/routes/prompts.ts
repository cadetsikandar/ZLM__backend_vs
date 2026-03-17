import { Router } from 'express';
import { listPrompts, getActivePrompts, createPrompt, updatePrompt, deletePrompt } from '../controllers/promptsController';
import { authenticate, adminOnly, allRoles } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/active',  allRoles,  getActivePrompts);
router.get('/',        adminOnly, listPrompts);
router.post('/',       adminOnly, createPrompt);
router.put('/:id',     adminOnly, updatePrompt);
router.delete('/:id',  adminOnly, deletePrompt);

export default router;
