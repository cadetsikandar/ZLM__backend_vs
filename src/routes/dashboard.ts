import { Router } from 'express';
import { getDashboardStats, getSystemHealth, getActivityFeed, getEditorFlagsForAllBooks } from '../controllers/dashboardController';
import { authenticate, allRoles, adminOnly } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/stats',        allRoles,  getDashboardStats);
router.get('/health',       adminOnly, getSystemHealth);
router.get('/activity',     allRoles,  getActivityFeed);
router.get('/editor-flags', allRoles,  getEditorFlagsForAllBooks);

export default router;
