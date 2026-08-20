import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const PRESET_AVATARS = [
  'linear-gradient(to right, #8b5cf6, #ec4899)', // Purple-Pink
  'linear-gradient(to right, #3b82f6, #06b6d4)', // Blue-Cyan
  'linear-gradient(to right, #10b981, #3b82f6)', // Emerald-Blue
  'linear-gradient(to right, #f59e0b, #ef4444)', // Amber-Red
  'linear-gradient(to right, #6366f1, #a855f7)', // Indigo-Purple
  'linear-gradient(to right, #ec4899, #f43f5e)', // Pink-Rose
];

const Profile = () => {
  const { user, logoutUser } = useAuth();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    avatar: '',
  });
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Initialize form with existing user data
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        bio: user.bio || '',
        avatar: user.avatar || PRESET_AVATARS[0],
      });
      // Check if avatar is custom url
      if (user.avatar && !PRESET_AVATARS.includes(user.avatar)) {
        setCustomAvatarUrl(user.avatar);
      }
    }
  }, [user]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
    if (success) setSuccess(false);
  };

  const selectPresetAvatar = (avatarStyle) => {
    setFormData({ ...formData, avatar: avatarStyle });
    setCustomAvatarUrl('');
    if (success) setSuccess(false);
  };

  const handleCustomAvatarChange = (e) => {
    const url = e.target.value;
    setCustomAvatarUrl(url);
    setFormData({ ...formData, avatar: url });
    if (success) setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await api.patch('/users/me', {
        name: formData.name,
        bio: formData.bio,
        avatar: formData.avatar,
      });

      if (response.data?.success) {
        setSuccess(true);
        // Force reload page to refresh session state or let state update
        // Since AuthContext reads session from /me, we could reload or let it update
        // We'll navigate to dashboard to reflect it, or trigger a page refresh
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      }
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const renderAvatarPreview = (avatarVal) => {
    if (!avatarVal) return null;
    if (avatarVal.startsWith('linear-gradient')) {
      return (
        <div 
          style={{ background: avatarVal }}
          className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-white text-3xl shadow-xl shadow-slate-950/50"
        >
          {formData.name ? formData.name.charAt(0).toUpperCase() : '?'}
        </div>
      );
    }
    // Assume custom URL
    return (
      <img
        src={avatarVal}
        alt="Avatar Preview"
        onError={(e) => { e.target.src = 'https://api.dicebear.com/7.x/bottts/svg'; }}
        className="w-24 h-24 rounded-full object-cover shadow-xl border-2 border-slate-800"
      />
    );
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 backdrop-blur-md relative">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-2">
          Your Profile
        </h2>
        <p className="text-slate-400 text-xs mb-6">Manage calling identity avatar, status bio, and credentials</p>

        {error && (
          <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl p-3 text-xs mb-6">
            Profile changes saved successfully! Redirecting...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Preview & Selection */}
          <div className="flex flex-col items-center space-y-4 pb-6 border-b border-slate-800">
            {renderAvatarPreview(formData.avatar)}
            
            <div className="text-center w-full">
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                Select System Color Gradient Avatar
              </label>
              <div className="flex justify-center gap-3 flex-wrap">
                {PRESET_AVATARS.map((style, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectPresetAvatar(style)}
                    style={{ background: style }}
                    className={`w-10 h-10 rounded-full border-2 transform transition-all active:scale-95 ${
                      formData.avatar === style ? 'border-white scale-110 shadow-lg shadow-violet-500/20' : 'border-transparent hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="w-full text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Or Input Custom Image URL
              </label>
              <input
                type="text"
                value={customAvatarUrl}
                onChange={handleCustomAvatarChange}
                placeholder="https://example.com/avatar.png"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2 text-xs text-slate-350 focus:outline-none focus:border-violet-500 transition-all"
              />
            </div>
          </div>

          {/* Text Inputs */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Display Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your Name"
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              About / Bio
            </label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              placeholder="Hey there, I am using VibeCall!"
              rows={3}
              maxLength={160}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-all resize-none"
            />
            <p className="text-right text-[10px] text-slate-500 mt-1">
              {formData.bio ? formData.bio.length : 0}/160 characters
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-1/2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-semibold py-2.5 rounded-lg text-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-1/2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-lg flex items-center justify-center space-x-2"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;
