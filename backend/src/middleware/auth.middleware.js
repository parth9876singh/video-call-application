import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { AppError } from './error.middleware.js';

export const protect = async (req, res, next) => {
  let token;

  // Read token from cookies (which is our standard production storage approach)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // Fallback check: Authorization Header (useful for API testing / script requests)
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Authentication failed: Access denied. No session token provided.', 401));
  }

  try {
    // Verify token signature
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user and ensure user exists. Select all fields EXCEPT passwordHash for security.
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return next(new AppError('Authentication failed: User no longer exists.', 401));
    }

    // Attach user payload to request context
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Authentication failed: Your session has expired. Please login again.', 401));
    }
    return next(new AppError('Authentication failed: Session token is invalid.', 401));
  }
};
