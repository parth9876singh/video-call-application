import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Header = () => {
  const { user, backendStatus, logoutUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const res = await logoutUser();
    if (res.success) {
      navigate('/login');
    }
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-[#0f172a]/70 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
      {/* Brand Logo */}
      <Link to="/" className="flex items-center space-x-2 hover:opacity-90 transition-all">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center font-bold text-white shadow-lg shadow-violet-500/20">
          V
        </div>
        <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-violet-400 to-fuchsia-300 bg-clip-text text-transparent">
          VibeCall
        </span>
      </Link>

      {/* Backend Status Indicator */}
      <div className="flex items-center space-x-4">
        <div className="hidden sm:flex items-center space-x-2 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800 text-xs">
          <span className={`w-2.5 h-2.5 rounded-full ${backendStatus.connected ? 'bg-emerald-500 shadow-md shadow-emerald-500/50' : 'bg-rose-500 shadow-md shadow-rose-500/50'}`}></span>
          <span className="text-slate-400 font-medium">
            {backendStatus.connected ? 'Server Connected' : 'Server Offline'}
          </span>
        </div>

        {/* User Info / Controls */}
        {user ? (
          <div className="flex items-center space-x-4">
            <Link 
              to="/profile" 
              className="text-xs bg-slate-800 hover:bg-slate-750 text-slate-200 px-3 py-1.5 rounded-md border border-slate-700 transition-all font-semibold"
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs bg-rose-600/25 hover:bg-rose-600/40 text-rose-300 px-3 py-1.5 rounded-md border border-rose-500/30 transition-all font-semibold"
            >
              Logout
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500">Not Logged In</span>
        )}
      </div>
    </header>
  );
};

export default Header;
