import axios from 'axios';

// Get API base URL from environment variables, fallback to local default
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Ensures HTTP-only cookies are sent with requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Collect error message from API response if available
    const message = error.response?.data?.message || 'Something went wrong. Please try again.';
    
    // Log error details during development
    if (import.meta.env.DEV) {
      console.error('[API Error Interceptor]:', {
        status: error.response?.status,
        message,
        data: error.response?.data,
      });
    }

    return Promise.reject(new Error(message));
  }
);

export default api;
