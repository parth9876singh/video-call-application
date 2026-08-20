import React, { useEffect, useState } from 'react';
import { useCall } from '../../context/CallContext';

const Avatar = ({ avatar, name }) => {
  if (avatar && avatar.startsWith('linear-gradient')) {
    return (
      <div
        style={{ background: avatar }}
        className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-white text-3xl shadow-2xl ring-4 ring-white/10"
      >
        {name?.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`}
      alt={name}
      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`; }}
      className="w-20 h-20 rounded-full object-cover ring-4 ring-white/10 shadow-2xl"
    />
  );
};

const OutgoingCall = () => {
  const { callState, CALL_STATUS, cancelCall } = useCall();
  const [dots, setDots] = useState('');
  const isOutgoing = callState.status === CALL_STATUS.RINGING_OUTGOING;

  // Animate "Calling..." dots
  useEffect(() => {
    if (!isOutgoing) return;
    const id = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(id);
  }, [isOutgoing]);

  if (!isOutgoing) return null;

  const { receiver } = callState;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0">
        <div className="relative w-full max-w-sm">
          <div className="absolute inset-0 rounded-3xl bg-violet-500/15 blur-2xl -z-10 animate-pulse" />
          <div className="bg-[#0f172a] border border-slate-700/60 rounded-3xl p-8 shadow-2xl flex flex-col items-center space-y-6 text-center">
            {/* Ripple circles behind avatar */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-32 h-32 rounded-full bg-violet-500/10 animate-ping" />
              <div className="absolute w-24 h-24 rounded-full bg-violet-500/10 animate-ping [animation-delay:0.3s]" />
              <Avatar avatar={receiver?.avatar} name={receiver?.name} />
            </div>

            <div>
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-2">
                Outgoing {callState.callType === 'video' ? 'Video' : 'Audio'} Call
              </p>
              <h2 className="text-xl font-bold text-white">
                {receiver?.name || 'Connecting…'}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Calling{dots}
              </p>
            </div>

            {/* Cancel button */}
            <button
              id="outgoing-call-cancel-btn"
              onClick={cancelCall}
              aria-label="Cancel call"
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 flex items-center justify-center shadow-lg shadow-rose-600/30 transition-all ring-2 ring-rose-500/30"
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p className="text-[11px] text-slate-500">Tap to cancel</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default OutgoingCall;
