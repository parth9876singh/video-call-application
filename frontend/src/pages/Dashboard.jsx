import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useCall } from '../context/CallContext';
import UserCard from '../components/dashboard/UserCard';
import api from '../services/api';

const Dashboard = () => {
  const { user, backendStatus } = useAuth();
  const { onlineUserIds, onlineUserProfiles } = useSocket();
  const { initiateCall, isInCall } = useCall();
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch users from search API
  const fetchUsers = useCallback(async (query = '', pageNum = 1) => {
    setSearchLoading(true);
    setError(null);
    try {
      const response = await api.get(`/users/search?q=${encodeURIComponent(query)}&page=${pageNum}&limit=5`);
      if (response.data?.success) {
        setUsers(response.data.users);
        setTotalPages(response.data.pagination.totalPages);
        setTotalResults(response.data.pagination.totalResults);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch user list');
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Fetch initial user list and handle search input changes
  useEffect(() => {
    // Initial fetch on mount
    fetchUsers(searchQuery, page);
  }, [page, fetchUsers]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1); // Reset page to 1 on new search
    fetchUsers(searchQuery, 1);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setPage(1);
    fetchUsers('', 1);
  };

  const fetchHealth = async () => {
    setHealthLoading(true);
    setError(null);
    try {
      const response = await api.get('/../health');
      setHealthStatus(response.data);
    } catch (err) {
      setError(err.message || 'Failed to fetch server health status');
    } finally {
      setHealthLoading(false);
    }
  };

  const handleCallUser = (targetUser) => {
    const currentUserId = user?.id || user?._id;
    const targetUserId = targetUser?.id || targetUser?._id;

    if (!targetUserId) {
      setError('Invalid contact selected.');
      return;
    }
    if (currentUserId && targetUserId.toString() === currentUserId.toString()) {
      setError('You cannot call yourself.');
      return;
    }
    if (isInCall) {
      setError('You are already in an active call.');
      return;
    }

    initiateCall(targetUser);
  };

  const renderOwnAvatar = () => {
    if (user?.avatar && user.avatar.startsWith('linear-gradient')) {
      return (
        <div 
          style={{ background: user.avatar }}
          className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-white text-2xl shadow-lg border border-slate-750"
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      );
    }
    return (
      <img
        src={user?.avatar || 'https://api.dicebear.com/7.x/bottts/svg'}
        alt="Your avatar"
        onError={(e) => { e.target.src = 'https://api.dicebear.com/7.x/bottts/svg'; }}
        className="w-16 h-16 rounded-full object-cover border border-slate-800"
      />
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Logged-in User Profile Summary & Health Check */}
        <div className="lg:col-span-4 space-y-6">
          {/* User Profile Card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-violet-600/5 rounded-full blur-2xl -z-10"></div>
            
            <div className="flex items-center space-x-4">
              {renderOwnAvatar()}
              <div className="text-left">
                <h3 className="font-bold text-slate-200 text-base">{user?.name}</h3>
                <p className="text-xs text-slate-500">{user?.email}</p>
                <div className="mt-1 flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Online</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-850 text-left">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">About / Bio</h4>
              <p className="text-xs text-slate-300 leading-relaxed italic">
                {user?.bio || '"No bio written yet. Click edit to write one!"'}
              </p>
            </div>

            <div className="mt-5">
              <Link
                to="/profile"
                className="block text-center text-xs bg-slate-800 hover:bg-slate-750 text-slate-200 py-2 rounded-lg font-semibold border border-slate-700 transition-all active:scale-98"
              >
                Edit Profile Settings
              </Link>
            </div>
          </div>

          {/* Diagnostic Panel */}
          <div className="bg-slate-900/20 border border-slate-850 rounded-xl p-5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-left">Diagnostics</h4>
            <div className="space-y-4">
              <button
                onClick={fetchHealth}
                disabled={healthLoading}
                className="w-full text-center text-xs bg-violet-600/20 hover:bg-violet-600/35 text-violet-400 font-semibold py-2 rounded-lg border border-violet-500/20 transition-all disabled:opacity-50"
              >
                {healthLoading ? 'Querying...' : 'Quick Uptime Check'}
              </button>

              {healthStatus && (
                <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 font-mono text-[10px] text-left text-emerald-400 overflow-x-auto">
                  <p>Database: {healthStatus.database}</p>
                  <p>Server Uptime: {Math.round(healthStatus.uptime)}s</p>
                  <p>Environment: {healthStatus.environment}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: User Search & Active Call Directory */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="text-left">
                <h2 className="text-xl font-bold text-slate-200">Call Directory</h2>
                <p className="text-slate-500 text-xs mt-0.5">Find online contacts and initialize video streams</p>
              </div>

              {/* Search Form */}
              <form onSubmit={handleSearchSubmit} className="flex w-full sm:w-auto items-center space-x-2">
                <div className="relative w-full sm:w-60">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full bg-slate-950/80 border border-slate-850 rounded-lg pl-3 pr-8 py-2 text-xs text-slate-350 focus:outline-none focus:border-violet-500 placeholder-slate-600"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 px-4 rounded-lg text-xs transition-all shadow-md shadow-violet-600/10"
                >
                  {searchLoading ? '...' : 'Search'}
                </button>
              </form>
            </div>

            {/* Error messaging */}
            {error && (
              <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-lg p-3 text-xs mb-4 text-left">
                {error}
              </div>
            )}

            {/* Users List */}
            {searchLoading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-slate-500">Querying call directory...</p>
              </div>
            ) : users.length > 0 ? (
              <div className="space-y-3">
                {users.map((item) => {
                  const itemIdStr = (item._id || item.id)?.toString();
                  const isOnline = onlineUserIds.has(itemIdStr);
                  const lastSeen = onlineUserProfiles[itemIdStr]?.lastSeen || item.lastSeen;
                  const updatedUser = { ...item, _id: itemIdStr, isOnline, lastSeen };
                  return (
                    <UserCard
                      key={item._id}
                      user={updatedUser}
                      onCallClick={handleCallUser}
                    />
                  );
                })}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-slate-850 mt-6 text-xs text-slate-400">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                      className="px-3 py-1.5 rounded bg-slate-950 border border-slate-850 hover:border-slate-800 disabled:opacity-40 transition-all font-semibold"
                    >
                      ← Previous
                    </button>
                    <span>
                      Page {page} of {totalPages} ({totalResults} contacts found)
                    </span>
                    <button
                      disabled={page === totalPages}
                      onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                      className="px-3 py-1.5 rounded bg-slate-950 border border-slate-850 hover:border-slate-800 disabled:opacity-40 transition-all font-semibold"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center border border-dashed border-slate-850 rounded-xl">
                <p className="text-slate-500 text-xs font-medium">No contacts found in directories.</p>
                <p className="text-slate-600 text-[10px] mt-1">Try register other test accounts or search another name query.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
