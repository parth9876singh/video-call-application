import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  // Store online user IDs in a Set for O(1) lookups
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  // Store extra online user profiles for rendering directory overlays if needed
  const [onlineUserProfiles, setOnlineUserProfiles] = useState({});

  useEffect(() => {
    // Only connect if the user is authenticated
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setOnlineUserIds(new Set());
      setOnlineUserProfiles({});
      return;
    }

    // Connect to Socket.IO signaling server
    const socketUrl = import.meta.env.VITE_API_BASE_URL 
      ? import.meta.env.VITE_API_BASE_URL.replace('/api', '') 
      : 'http://localhost:5000';

    console.log(`[Socket] Connecting to signaling server: ${socketUrl}`);
    
    const socketInstance = io(socketUrl, {
      withCredentials: true, // Crucial for sending HTTP-only authentication cookies
      transports: ['websocket', 'polling'], // Fallback options
      autoConnect: true,
    });

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected with ID:', socketInstance.id);
    });

    // Listen to full initial presence update
    socketInstance.on('presence:update', (onlineUsersList) => {
      console.log('[Socket] Presence update list:', onlineUsersList);
      const ids = new Set(onlineUsersList.map(u => u._id));
      const profiles = {};
      onlineUsersList.forEach(u => {
        profiles[u._id] = u;
      });
      setOnlineUserIds(ids);
      setOnlineUserProfiles(profiles);
    });

    // Listen to single user online broadcast
    socketInstance.on('user:online', (userData) => {
      console.log('[Socket] User went online:', userData.name);
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.add(userData.userId);
        return next;
      });
      setOnlineUserProfiles((prev) => ({
        ...prev,
        [userData.userId]: {
          _id: userData.userId,
          name: userData.name,
          email: userData.email,
          avatar: userData.avatar,
          bio: userData.bio,
          isOnline: true,
        }
      }));
    });

    // Listen to single user offline broadcast
    socketInstance.on('user:offline', (data) => {
      console.log('[Socket] User went offline ID:', data.userId);
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(data.userId);
        return next;
      });
      setOnlineUserProfiles((prev) => {
        const next = { ...prev };
        if (next[data.userId]) {
          next[data.userId].isOnline = false;
          next[data.userId].lastSeen = data.lastSeen;
        }
        return next;
      });
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    setSocket(socketInstance);

    // Clean up connections on unmount
    return () => {
      console.log('[Socket] Disconnecting instance on unmount...');
      socketInstance.disconnect();
    };
  }, [user]);

  // Check if a specific user is currently online
  const isUserOnline = (userId) => {
    return onlineUserIds.has(userId.toString());
  };

  const value = {
    socket,
    onlineUserIds,
    onlineUserProfiles,
    isUserOnline,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
