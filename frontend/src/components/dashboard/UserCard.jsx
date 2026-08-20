import React from 'react';

const formatLastSeen = (dateString) => {
  if (!dateString) return 'Never';
  const lastSeenDate = new Date(dateString);
  const now = new Date();
  const diffMs = now - lastSeenDate;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
};

const UserCard = ({ user, onCallClick }) => {
  const { name, email, avatar, bio, isOnline, lastSeen } = user;

  const renderAvatar = () => {
    if (avatar && avatar.startsWith('linear-gradient')) {
      return (
        <div
          style={{ background: avatar }}
          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-inner relative"
        >
          {name.charAt(0).toUpperCase()}
          {/* Online status indicator ring */}
          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#070a13] ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
        </div>
      );
    }

    // Custom avatar URL or placeholder
    return (
      <div className="relative">
        <img
          src={avatar || 'https://api.dicebear.com/7.x/bottts/svg'}
          alt={`${name}'s avatar`}
          onError={(e) => { e.target.src = 'https://api.dicebear.com/7.x/bottts/svg'; }}
          className="w-12 h-12 rounded-full object-cover border border-slate-800"
        />
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#070a13] ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
      </div>
    );
  };

  return (
    <div className="bg-slate-900/30 border border-slate-850 hover:border-slate-800 rounded-xl p-4 flex items-center justify-between transition-all hover:bg-slate-900/50">
      <div className="flex items-center space-x-4">
        {renderAvatar()}
        <div className="text-left">
          <h4 className="font-semibold text-slate-200 text-sm flex items-center space-x-2">
            <span>{name}</span>
            <span className="text-[10px] font-normal text-slate-500">({email})</span>
          </h4>
          <p className="text-slate-400 text-xs mt-0.5 line-clamp-1 max-w-[240px]">
            {bio || 'No bio written yet.'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">
            {isOnline ? (
              <span className="text-emerald-400 font-semibold">Active now</span>
            ) : (
              <span>Last seen {formatLastSeen(lastSeen)}</span>
            )}
          </p>
        </div>
      </div>

      <button
        onClick={() => onCallClick && onCallClick(user)}
        className={`text-xs px-4 py-2 rounded-lg font-semibold border transition-all active:scale-95 flex items-center space-x-1.5 ${
          isOnline
            ? 'bg-violet-600 hover:bg-violet-700 text-white border-violet-500 shadow-md shadow-violet-600/10'
            : 'bg-slate-950 text-slate-500 border-slate-850 cursor-not-allowed'
        }`}
        disabled={!isOnline}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span>Call</span>
      </button>
    </div>
  );
};

export default UserCard;
