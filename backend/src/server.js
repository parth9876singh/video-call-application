// Load env variables early
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app.js';
import connectDB from './config/db.js';
import { initSocket } from './services/socket.service.js';
import logger from './utils/logger.js';
import mongoose from 'mongoose';

const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Create HTTP Server
const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocket(server);
logger.info('Socket.IO initialized successfully.');

// Start Server
const serverInstance = server.listen(PORT, () => {
  logger.info(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Graceful Shutdown Handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new HTTP requests
  serverInstance.close(async () => {
    logger.info('HTTP server closed.');

    try {
      // 2. Disconnect all socket.io clients
      io.close(() => {
        logger.info('Socket.IO connections closed.');
      });

      // 3. Close database connection
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed.');

      logger.info('Graceful shutdown completed successfully. Exiting process.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force close after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.warn('Forcing server shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

// Process events for terminating signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled rejections and exceptions
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! Shutting down...', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});
