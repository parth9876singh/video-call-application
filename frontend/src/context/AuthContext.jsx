import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState({ connected: false, message: 'Connecting...' });

  // Verify backend connectivity and check existing user session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check general backend connectivity
        const welcomeResponse = await api.get('/welcome');
        if (welcomeResponse.data?.success) {
          setBackendStatus({
            connected: true,
            message: welcomeResponse.data.message
          });
        }

        // Check if there is an active HTTP-only session cookie by calling /me
        const userResponse = await api.get('/auth/me');
        if (userResponse.data?.success) {
          setUser(userResponse.data.user);
        }
      } catch (err) {
        // If /auth/me returns 401, it means user is not authenticated. This is not a critical error.
        if (err.message.includes('401') || err.message.includes('denied') || err.message.includes('expired')) {
          setUser(null);
        } else {
          // General connection error
          setBackendStatus({
            connected: false,
            message: `Failed to connect to server: ${err.message}`
          });
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Register action
  const registerUser = async (name, email, password) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/register', { name, email, password });
      if (response.data?.success) {
        setUser(response.data.user);
        return { success: true };
      }
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Login action
  const loginUser = async (email, password) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data?.success) {
        setUser(response.data.user);
        return { success: true };
      }
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Logout action
  const logoutUser = async () => {
    setLoading(true);
    try {
      await api.post('/auth/logout');
      setUser(null);
      return { success: true };
    } catch (err) {
      console.error('Logout error:', err.message);
      // Fallback: Clear user locally even if server logout fails
      setUser(null);
      return { success: true };
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    backendStatus,
    registerUser,
    loginUser,
    logoutUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
