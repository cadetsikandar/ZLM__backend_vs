import { Router } from 'express';
import { login, register, refresh, logout, me } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/login',    authLimiter, login);
router.post('/register', authLimiter, register);
router.post('/refresh',  refresh);
router.post('/logout',   logout);
router.get('/me',        authenticate, me);

export default router;
