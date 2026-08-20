import logger from '../utils/logger.js';

// Centralized error handling middleware
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';

  logger.error(`${req.method} ${req.originalUrl} - Error: ${err.message}`, err);

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: isDev ? err.stack : undefined
  });
};

// Custom AppError class for operational errors
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export {
  errorHandler,
  AppError
};
