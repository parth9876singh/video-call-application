import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';
import { registerCallHandlers } from './call.signaling.js';

let io = null;

// In-memory mapping to support multiple tabs/connections per user
// Key: userId (string) -> Value: Set of socketIds (Set<string>)
const userSockets = new Map();

// Helper to parse cookies from handshake headers
const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const parts = cookie.split('=');
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
};

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Socket.IO Middleware for Authentication
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = parseCookies(cookieHeader);
      let token = cookies.token;

      // Fallback 1: Handshake Auth parameters (useful for React Native or tests)
      if (!token && socket.handshake.auth) {
        token = socket.handshake.auth.token;
      }

      // Fallback 2: Handshake Authorization header
      if (!token && socket.handshake.headers.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
        }
      }

      if (!token) {
        logger.warn('Socket connection rejected: No token provided');
        return next(new Error('Authentication failed: Token is missing'));
      }

      // Verify JWT signature
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Query MongoDB to ensure the user still exists
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (!user) {
        logger.warn(`Socket connection rejected: User ${decoded.id} no longer exists`);
        return next(new Error('Authentication failed: User not found'));
      }

      // Bind user data to socket context
      socket.user = user;
      next();
    } catch (err) {
      logger.error('Socket authentication middleware error:', err);
      return next(new Error('Authentication failed: Invalid token'));
    }
  });

  // Connection Handler
  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    const username = socket.user.name;
    
    logger.info(`Socket connected: ${socket.id} (User: ${username}, ID: ${userId})`);

    // Add socket ID to the user's socket list
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    const socketsSet = userSockets.get(userId);
    socketsSet.add(socket.id);

    // If this is the user's FIRST active tab/socket connection
    if (socketsSet.size === 1) {
      try {
        await User.findByIdAndUpdate(userId, {
          isOnline: true,
          socketId: socket.id
        });
        
        logger.info(`User went online: ${username} (ID: ${userId})`);

        socket.broadcast.emit('user:online', {
          userId,
          name: username,
          avatar: socket.user.avatar,
          email: socket.user.email,
          bio: socket.user.bio
        });
      } catch (err) {
        logger.error(`Error updating online status for ${username}:`, err);
      }
    } else {
      await User.findByIdAndUpdate(userId, { socketId: socket.id }).catch(err => {
        logger.error(`Error updating primary socket reference for ${username}:`, err);
      });
    }

    // Emit full online user list to newly connected client
    try {
      const onlineUsers = await User.find({ isOnline: true })
        .select('_id name email avatar bio lastSeen');
      socket.emit('presence:update', onlineUsers);
    } catch (err) {
      logger.error('Error fetching online users list for presence:update:', err);
    }

    // Register all call signaling handlers (offer/answer/ICE is Phase 5)
    registerCallHandlers(socket, io, { getUserActiveSockets });

    // Disconnect Handler
    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: ${socket.id} (User: ${username}, ID: ${userId})`);

      const userSet = userSockets.get(userId);
      if (userSet) {
        userSet.delete(socket.id);

        if (userSet.size === 0) {
          userSockets.delete(userId);

          try {
            const lastSeenTime = new Date();
            await User.findByIdAndUpdate(userId, {
              isOnline: false,
              socketId: null,
              lastSeen: lastSeenTime
            });

            logger.info(`User went offline: ${username} (ID: ${userId})`);

            io.emit('user:offline', {
              userId,
              lastSeen: lastSeenTime
            });
          } catch (err) {
            logger.error(`Error updating offline status for ${username}:`, err);
          }
        } else {
          const nextSocketId = Array.from(userSet)[0];
          await User.findByIdAndUpdate(userId, { socketId: nextSocketId }).catch(err => {
            logger.error(`Error updating primary socket reference after tab closure:`, err);
          });
        }
      }
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized!');
  }
  return io;
};

// Helper to fetch all active sockets of a user (used by call signaling)
export const getUserActiveSockets = (userId) => {
  const sockets = userSockets.get(userId.toString());
  return sockets ? Array.from(sockets) : [];
};
