import User from '../models/user.model.js';
import { AppError } from '../middleware/error.middleware.js';
import logger from '../utils/logger.js';

// @desc    Get current logged in user details
// @route   GET /api/users/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    // req.user is set by auth middleware, but let's query fresh from DB
    const user = await User.findById(req.user._id).select('-passwordHash');
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update user profile
// @route   PATCH /api/users/me
// @access  Private
export const updateMe = async (req, res, next) => {
  try {
    const { name, bio, avatar } = req.body;
    
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (bio !== undefined) updates.bio = bio.trim();
    if (avatar !== undefined) updates.avatar = avatar.trim();

    // Check if there are fields to update
    if (Object.keys(updates).length === 0) {
      return next(new AppError('No update fields provided', 400));
    }

    // Find and update user profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    logger.info(`Profile updated for user: ${updatedUser.email}`);

    res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Search users by name or email (with pagination)
// @route   GET /api/users/search
// @access  Private
export const searchUsers = async (req, res, next) => {
  try {
    const query = req.query.q ? req.query.q.trim() : '';
    
    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30); // Max limit of 30
    const skip = (page - 1) * limit;

    // Base filter: Do not include the current user in search lists
    const filter = { _id: { $ne: req.user._id } };

    // Apply regex search on name or email if search string query is provided
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ];
    }

    // Perform queries
    const users = await User.find(filter)
      .select('name email avatar bio isOnline lastSeen') // Minimize response data payload
      .sort({ isOnline: -1, name: 1 }) // Sort online users first, then by name
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: users.length,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalResults: total
      },
      users,
    });
  } catch (err) {
    next(err);
  }
};
