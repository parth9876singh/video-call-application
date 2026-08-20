import { Router } from 'express';
import { getMe, updateMe, searchUsers } from '../controllers/user.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { updateUserSchema } from '../utils/validation.schemas.js';
import { searchLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Apply auth middleware to protect all user endpoints
router.use(protect);

router.get('/me', getMe);
router.patch('/me', validateBody(updateUserSchema), updateMe);
router.get('/search', searchLimiter, searchUsers);

export default router;
