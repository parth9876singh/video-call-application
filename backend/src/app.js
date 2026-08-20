import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';

import { errorHandler, AppError } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import logger from './utils/logger.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();

// Trust reverse proxy for Render / load balancer IP rate-limiting & secure cookies
app.set('trust proxy', 1);

// Security Middlewares
app.use(helmet());

// CORS configuration - values read from .env
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Parsing Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging using Morgan
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Apply rate limiter to all API routes
app.use('/api', apiLimiter);

// Mount Authentication Routes
app.use('/api/auth', authRoutes);

// Mount User Routes
app.use('/api/users', userRoutes);

// Root endpoint for Render deployment health check bots
app.all('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Video Call API Service is Live',
    health: '/health'
  });
});

// Health Check Endpoint (returns server and db status)
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  let dbStatus = 'disconnected';
  if (dbState === 1) dbStatus = 'connected';
  else if (dbState === 2) dbStatus = 'connecting';
  else if (dbState === 3) dbStatus = 'disconnecting';

  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date(),
    uptime: process.uptime(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Mock/Base API Route for checking backend connectivity from frontend
app.get('/api/welcome', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to the 1-to-1 Video Calling API Server!'
  });
});

// Catch all unmatched routes and trigger 404
app.use((req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// Centralized error handler
app.use(errorHandler);

export default app;
