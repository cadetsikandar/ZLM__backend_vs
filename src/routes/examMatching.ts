import { Router } from 'express';
import { listProviders, listCountries, matchExam, getAllMappings } from '../controllers/examMatchingController';
import { authenticate, adminOnly, allRoles } from '../middleware/auth';

const router = Router();

// Public endpoints (no auth needed for provider/country lists — used by NewBook wizard)
router.get('/providers', listProviders);
router.get('/countries', listCountries);
router.post('/match-exam', matchExam);

// Admin only
router.get('/mappings', authenticate, adminOnly, getAllMappings);

export default router;
