import React, { useEffect, useState } from 'react';
import { useCall } from '../../context/CallContext';

const TIMEOUT_SECONDS = 30;

// Render a gradient or image avatar
const Avatar = ({ avatar, name, size = 'lg' }) => {
  const dim = size === 'lg' ? 'w-20 h-20 text-3xl' : 'w-12 h-12 text-lg';
  if (avatar && avatar.startsWith('linear-gradient')) {
    return (
      <div
        style={{ background: avatar }}
        className={`${dim} rounded-full flex items-center justify-center font-bold text-white shadow-2xl ring-4 ring-white/10`}
      >
        {name?.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`}
      alt={`${name}'s avatar`}
      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`; }}
      className={`${dim} rounded-full object-cover ring-4 ring-white/10 shadow-2xl`}
    />
  );
};

// Countdown arc indicator
const CountdownRing = ({ seconds, total }) => {
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const progress = (seconds / total) * circumference;

  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 88 88">
      {/* Background ring */}
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      {/* Countdown ring */}
      <circle
        cx="44" cy="44" r={r}
        fill="none"
        stroke={seconds > 10 ? '#8b5cf6' : '#ef4444'}
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-linear"
      />
    </svg>
  );
};

const IncomingCall = () => {
  const { callState, CALL_STATUS, acceptCall, rejectCall } = useCall();
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const [visible, setVisible] = useState(false);

  const isIncoming = callState.status === CALL_STATUS.RINGING_INCOMING;

  // Animate in/out
  useEffect(() => {
    if (isIncoming) {
      setSecondsLeft(TIMEOUT_SECONDS);
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [isIncoming]);

  // Countdown timer display
  useEffect(() => {
    if (!isIncoming) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isIncoming]);

  if (!isIncoming && !visible) return null;

  const { caller, callType } = callState;
  const isVideo = callType === 'video';

  return (
    <>
      {/* Backdrop blur overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${visible && isIncoming ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-hidden="true"
      />

      {/* Modal card — centered on desktop, bottom sheet feel on mobile */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Incoming ${isVideo ? 'video' : 'audio'} call from ${caller?.name}`}
        className={`
          fixed z-50 left-1/2 -translate-x-1/2
          bottom-6 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2
          w-[calc(100%-2rem)] max-w-sm
          transition-all duration-500 ease-out
          ${visible && isIncoming
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
          }
        `}
      >
        {/* Glowing ring pulse around card */}
        <div className="absolute inset-0 rounded-3xl bg-violet-500/20 blur-2xl animate-pulse -z-10" />

        <div className="bg-[#0f172a] border border-slate-700/60 rounded-3xl p-7 shadow-2xl shadow-black/60 relative overflow-hidden">
          {/* Decorative gradient blobs */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-violet-600/10 rounded-full blur-3xl -z-0 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-fuchsia-600/10 rounded-full blur-3xl -z-0 pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center space-y-5">
            {/* Header */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest flex items-center justify-center space-x-2">
                {isVideo ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Incoming Video Call</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Incoming Audio Call</span>
                  </>
                )}
              </p>
            </div>

            {/* Avatar with countdown ring */}
            <div className="relative w-24 h-24">
              <CountdownRing seconds={secondsLeft} total={TIMEOUT_SECONDS} />
              <div className="absolute inset-2 flex items-center justify-center">
                <Avatar avatar={caller?.avatar} name={caller?.name} />
              </div>
            </div>

            {/* Caller name & email */}
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {caller?.name || 'Unknown Caller'}
              </h2>
              {caller?.email && (
                <p className="text-xs text-slate-400">{caller.email}</p>
              )}
            </div>

            {/* Countdown text */}
            <p className="text-[11px] text-slate-500">
              Auto-declining in{' '}
              <span className={`font-bold tabular-nums ${secondsLeft <= 10 ? 'text-rose-400' : 'text-slate-300'}`}>
                {secondsLeft}s
              </span>
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-center space-x-8 pt-2 w-full">
              {/* Reject */}
              <div className="flex flex-col items-center space-y-2">
                <button
                  id="incoming-call-reject-btn"
                  onClick={rejectCall}
                  aria-label="Reject call"
                  className="
                    w-16 h-16 rounded-full
                    bg-rose-600 hover:bg-rose-500 active:scale-95
                    flex items-center justify-center
                    shadow-lg shadow-rose-600/30
                    transition-all duration-150
                    ring-2 ring-rose-500/30
                  "
                >
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                  </svg>
                </button>
                <span className="text-[11px] text-slate-400 font-medium">Decline</span>
              </div>

              {/* Accept */}
              <div className="flex flex-col items-center space-y-2">
                <button
                  id="incoming-call-accept-btn"
                  onClick={acceptCall}
                  aria-label="Accept call"
                  className="
                    w-16 h-16 rounded-full
                    bg-emerald-600 hover:bg-emerald-500 active:scale-95
                    flex items-center justify-center
                    shadow-lg shadow-emerald-600/30
                    transition-all duration-150
                    ring-2 ring-emerald-500/30
                    animate-[pulse_2s_ease-in-out_infinite]
                  "
                >
                  {isVideo ? (
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  )}
                </button>
                <span className="text-[11px] text-emerald-400 font-medium">Accept</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default IncomingCall;
