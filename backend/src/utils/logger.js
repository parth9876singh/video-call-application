const logger = {
  info: (message, meta = '') => {
    const timestamp = new Date().toISOString();
    console.log(`\x1b[32m[INFO]\x1b[0m [${timestamp}] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message, meta = '') => {
    const timestamp = new Date().toISOString();
    console.warn(`\x1b[33m[WARN]\x1b[0m [${timestamp}] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message, error = '') => {
    const timestamp = new Date().toISOString();
    const errorDetails = error && error.stack ? error.stack : error;
    console.error(`\x1b[31m[ERROR]\x1b[0m [${timestamp}] ${message}`, errorDetails || '');
  },
  debug: (message, meta = '') => {
    if (process.env.NODE_ENV !== 'production') {
      const timestamp = new Date().toISOString();
      console.log(`\x1b[36m[DEBUG]\x1b[0m [${timestamp}] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }
};

export default logger;
