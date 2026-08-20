import { Router } from 'express';
import { register, login, logout, me } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../utils/validation.schemas.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Apply strict rate limiting to registering & logging in
router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/login', authLimiter, validateBody(loginSchema), login);

// Session clearing and verification routes
router.post('/logout', protect, logout);
router.get('/me', protect, me);

export default router;
