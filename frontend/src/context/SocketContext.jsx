import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [onlineUserProfiles, setOnlineUserProfiles] = useState({});

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setOnlineUserIds(new Set());
      setOnlineUserProfiles({});
      return;
    }

    const socketUrl = import.meta.env.VITE_API_BASE_URL 
      ? import.meta.env.VITE_API_BASE_URL.replace('/api', '') 
      : 'http://localhost:5000';

    const userId = user.id || user._id;
    console.log(`[Socket] Connecting as user "${user.name}" (${userId}) to ${socketUrl}`);

    const socketInstance = io(socketUrl, {
      withCredentials: true,
      auth: {
        userId: userId?.toString(),
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socketInstance.on('connect', () => {
      console.log(`[Socket] Connected successfully for ${user.name} (Socket ID: ${socketInstance.id})`);
    });

    socketInstance.on('presence:update', (onlineUsersList) => {
      console.log('[Socket] Online users updated:', onlineUsersList.map(u => u.name));
      const ids = new Set(onlineUsersList.map(u => (u._id || u.id)?.toString()));
      const profiles = {};
      onlineUsersList.forEach(u => {
        const idStr = (u._id || u.id)?.toString();
        if (idStr) profiles[idStr] = u;
      });
      setOnlineUserIds(ids);
      setOnlineUserProfiles(profiles);
    });

    socketInstance.on('user:online', (userData) => {
      console.log('[Socket] User came online:', userData.name);
      const idStr = userData.userId?.toString();
      if (idStr) {
        setOnlineUserIds((prev) => new Set(prev).add(idStr));
        setOnlineUserProfiles((prev) => ({
          ...prev,
          [idStr]: {
            _id: idStr,
            name: userData.name,
            email: userData.email,
            avatar: userData.avatar,
            bio: userData.bio,
            isOnline: true,
          }
        }));
      }
    });

    socketInstance.on('user:offline', (data) => {
      console.log('[Socket] User went offline:', data.userId);
      const idStr = data.userId?.toString();
      if (idStr) {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          next.delete(idStr);
          return next;
        });
        setOnlineUserProfiles((prev) => {
          const next = { ...prev };
          if (next[idStr]) {
            next[idStr].isOnline = false;
            next[idStr].lastSeen = data.lastSeen;
          }
          return next;
        });
      }
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  const isUserOnline = (userId) => {
    if (!userId) return false;
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
