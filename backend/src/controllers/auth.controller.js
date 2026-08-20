import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { AppError } from '../middleware/error.middleware.js';
import logger from '../utils/logger.js';

// Helper to generate JWT and set HTTP-only cookie
const sendTokenResponse = (user, statusCode, res) => {
  const payload = { id: user._id, email: user.email };
  
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d', // Token expires in 7 days
  });

  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in ms
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };

  logger.info(`Session started for user: ${user.email}`);

  res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        isOnline: user.isOnline,
      },
    });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { name, email, password, bio, avatar } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new AppError('An account with this email address already exists', 409));
    }

    // Create new user (passwordHash is automatically encrypted via pre-save mongoose hook)
    const user = await User.create({
      name,
      email,
      passwordHash: password, // Named passwordHash in schema
      bio,
      avatar,
    });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Authenticate user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      // Safe generic message
      return next(new AppError('Invalid email or password', 401));
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Safe generic message
      return next(new AppError('Invalid email or password', 401));
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Log user out / clear cookie
// @route   POST /api/auth/logout
// @access  Private
export const logout = (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  logger.info(`Session cleared.`);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

// @desc    Get current authenticated user details
// @route   GET /api/auth/me
// @access  Private
export const me = (req, res) => {
  // req.user is set by auth middleware
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      bio: req.user.bio,
      isOnline: req.user.isOnline,
    },
  });
};
