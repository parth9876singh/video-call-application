import VideoStream from './VideoStream';
import { useCall } from '../../context/CallContext';

const statusLabel = (status, connectionState) => {
  if (status === 'outgoing') return 'Calling…';
  if (status === 'incoming') return 'Incoming call';
  if (status === 'connecting') return 'Connecting…';
  if (status === 'active') {
    if (connectionState === 'connected') return 'Connected';
    return 'Connected (stabilizing…)';
  }
  return status;
};

export default function CallOverlay() {
  const {
    status,
    remoteUser,
    error,
    localStream,
    remoteStream,
    isMicEnabled,
    isCameraEnabled,
    connectionState,
    acceptCall,
    rejectCall,
    endCall,
    toggleMicrophone,
    toggleCamera,
    clearError,
  } = useCall();

  if (status === 'idle') {
    if (!error) return null;
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-rose-500/30 bg-rose-950/90 px-4 py-2 text-xs text-rose-200 shadow-lg">
        <span>{error.message}</span>
        <button type="button" onClick={clearError} className="ml-3 underline">
          Dismiss
        </button>
      </div>
    );
  }

  const showVideo = status === 'connecting' || status === 'active';
  const showIncomingActions = status === 'incoming';
  const showHangup = status === 'outgoing' || status === 'connecting' || status === 'active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070a13]/85 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-100">
              {remoteUser?.name || 'Unknown'}
            </p>
            <p className="text-[11px] text-slate-500">
              {statusLabel(status, connectionState)}
              {remoteUser?.email ? ` · ${remoteUser.email}` : ''}
            </p>
          </div>
          {error ? (
            <p className="max-w-xs truncate text-[11px] text-rose-300">{error.message}</p>
          ) : null}
        </div>

        {showIncomingActions ? (
          <div className="flex flex-col items-center gap-6 px-6 py-16">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-600/20 text-3xl font-bold text-violet-300">
              {(remoteUser?.name || '?').charAt(0).toUpperCase()}
            </div>
            <p className="text-base text-slate-200">
              <span className="font-semibold">{remoteUser?.name}</span> is calling you
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={rejectCall}
                className="rounded-lg border border-rose-500/40 bg-rose-600/20 px-5 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-600/35"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={acceptCall}
                className="rounded-lg border border-emerald-500/40 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Accept
              </button>
            </div>
          </div>
        ) : null}

        {status === 'outgoing' ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-sm text-slate-300">
              Calling <span className="font-semibold">{remoteUser?.name}</span>…
            </p>
          </div>
        ) : null}

        {showVideo ? (
          <div className="relative aspect-video bg-black">
            <VideoStream
              stream={remoteStream}
              className="absolute inset-0 h-full w-full"
              label={remoteUser?.name || 'Remote'}
            />
            <div className="absolute bottom-3 right-3 h-28 w-40 overflow-hidden rounded-lg border border-slate-700 shadow-lg sm:h-36 sm:w-52">
              <VideoStream
                stream={localStream}
                muted
                mirror
                className="h-full w-full"
                label="You"
              />
            </div>
          </div>
        ) : null}

        {(showHangup || showVideo) && (
          <div className="flex items-center justify-center gap-3 border-t border-slate-800 px-5 py-4">
            {showVideo ? (
              <>
                <button
                  type="button"
                  onClick={toggleMicrophone}
                  className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                    isMicEnabled
                      ? 'border-slate-700 bg-slate-900 text-slate-200'
                      : 'border-rose-500/40 bg-rose-950/50 text-rose-200'
                  }`}
                >
                  {isMicEnabled ? 'Mute' : 'Unmute'}
                </button>
                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                    isCameraEnabled
                      ? 'border-slate-700 bg-slate-900 text-slate-200'
                      : 'border-rose-500/40 bg-rose-950/50 text-rose-200'
                  }`}
                >
                  {isCameraEnabled ? 'Camera off' : 'Camera on'}
                </button>
              </>
            ) : null}
            {showHangup ? (
              <button
                type="button"
                onClick={endCall}
                className="rounded-lg border border-rose-500/50 bg-rose-600 px-5 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                End call
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
