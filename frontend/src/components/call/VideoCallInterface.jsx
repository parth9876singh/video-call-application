import { useCallback, useEffect, useId, useRef, useState } from 'react';
import VideoStream from './VideoStream';
import CallControls from './CallControls';
import CallTimer from './CallTimer';
import ConnectionQualityBadge from './ConnectionQualityBadge';
import { useCall } from '../../context/CallContext';

const STATUS_COPY = {
  ringing: {
    caller: 'Ringing…',
    receiver: 'Incoming call',
  },
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  ended: 'Call ended',
  failed: 'Call failed',
};

function RemoteAvatar({ name }) {
  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-violet-600/25 text-4xl font-semibold text-violet-200 ring-1 ring-violet-400/30 sm:h-28 sm:w-28">
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

export default function VideoCallInterface() {
  const titleId = useId();
  const stageRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionError, setActionError] = useState(null);

  const {
    status,
    role,
    remoteUser,
    error,
    callDurationSec,
    localStream,
    remoteStream,
    isMicEnabled,
    isCameraEnabled,
    isScreenSharing,
    connectionQuality,
    acceptCall,
    rejectCall,
    endCall,
    dismissTerminal,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    clearError,
  } = useCall();

  const remoteName = remoteUser?.name || 'Participant';
  const isRinging = status === 'ringing';
  const isIncoming = isRinging && role === 'receiver';
  const isOutgoing = isRinging && role === 'caller';
  const inMediaSession = ['connecting', 'connected', 'reconnecting'].includes(status);
  const isTerminal = status === 'ended' || status === 'failed';
  const statusLabel =
    status === 'ringing'
      ? STATUS_COPY.ringing[role === 'receiver' ? 'receiver' : 'caller']
      : STATUS_COPY[status] || status;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const syncFullscreenState = useCallback(() => {
    const active = document.fullscreenElement === stageRef.current;
    setIsFullscreen(Boolean(active));
  }, []);

  useEffect(() => {
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, [syncFullscreenState]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await stageRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      setActionError('Full screen is not available in this browser.');
    }
  }, []);

  const handleScreenShare = useCallback(async () => {
    setActionError(null);
    try {
      await toggleScreenShare();
    } catch (err) {
      setActionError(err?.message || 'Unable to share screen.');
    }
  }, [toggleScreenShare]);

  // Keyboard-friendly controls
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;

      const key = event.key.toLowerCase();

      if (key === 'escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
          return;
        }
        if (isIncoming) {
          rejectCall();
          return;
        }
        if (!isTerminal) {
          endCall();
        } else {
          dismissTerminal();
        }
        return;
      }

      if (isIncoming && key === 'a') {
        event.preventDefault();
        acceptCall();
        return;
      }

      if (!inMediaSession) return;

      if (key === 'm') {
        event.preventDefault();
        toggleMicrophone();
      } else if (key === 'c') {
        event.preventDefault();
        if (!isScreenSharing) toggleCamera();
      } else if (key === 's') {
        event.preventDefault();
        handleScreenShare();
      } else if (key === 'f') {
        event.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    acceptCall,
    dismissTerminal,
    endCall,
    handleScreenShare,
    inMediaSession,
    isIncoming,
    isScreenSharing,
    isTerminal,
    rejectCall,
    toggleCamera,
    toggleFullscreen,
    toggleMicrophone,
  ]);

  useEffect(() => {
    if (!actionError) return undefined;
    const id = window.setTimeout(() => setActionError(null), 4000);
    return () => window.clearTimeout(id);
  }, [actionError]);

  const bannerError = actionError || error?.message;
  const localEmptyMessage = isScreenSharing
    ? 'Screen share starting…'
    : isCameraEnabled
      ? 'Starting camera…'
      : 'Camera is off';
  const remoteEmptyMessage =
    status === 'connecting'
      ? 'Waiting for remote video…'
      : status === 'reconnecting'
        ? 'Reconnecting to peer…'
        : 'Remote camera is off';

  return (
    <div
      ref={stageRef}
      className="fixed inset-0 z-50 flex flex-col bg-[#05070d] text-slate-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Header — fixed height to avoid layout shift */}
      <header className="relative z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-black/35 px-4 backdrop-blur-md sm:px-6">
        <div className="min-w-0 text-left">
          <h2 id={titleId} className="truncate text-sm font-semibold sm:text-base">
            {remoteName}
          </h2>
          <p className="truncate text-[11px] text-slate-400" aria-live="polite">
            {statusLabel}
            {remoteUser?.email ? ` · ${remoteUser.email}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {(status === 'connected' || status === 'reconnecting') && (
            <CallTimer seconds={callDurationSec} className="text-xs sm:text-sm" />
          )}
          {inMediaSession && (
            <ConnectionQualityBadge
              quality={connectionQuality}
              reconnecting={status === 'reconnecting'}
            />
          )}
        </div>
      </header>

      {/* Stage — fills remaining viewport */}
      <div className="relative min-h-0 flex-1">
        {inMediaSession ? (
          <>
            <VideoStream
              stream={remoteStream}
              className="absolute inset-0 h-full w-full"
              avatarName={remoteName}
              emptyMessage={remoteEmptyMessage}
              fit="contain"
              label={remoteName}
            />

            {/* Local preview — reserved box, no CLS */}
            <div className="absolute bottom-3 right-3 h-28 w-20 overflow-hidden rounded-xl border border-white/15 bg-slate-950 shadow-xl shadow-black/40 sm:bottom-4 sm:right-4 sm:h-40 sm:w-28 md:h-44 md:w-32">
              <VideoStream
                stream={localStream}
                muted
                mirror={!isScreenSharing}
                className="h-full w-full"
                avatarName="You"
                emptyMessage={localEmptyMessage}
                label={isScreenSharing ? 'Screen' : 'You'}
                fit="cover"
              />
              {!isMicEnabled && (
                <span className="absolute right-1.5 top-1.5 rounded bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  Muted
                </span>
              )}
            </div>

            {status === 'connecting' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/55 px-6 py-5 backdrop-blur-sm">
                  <div
                    className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-slate-200">Establishing secure connection…</p>
                </div>
              </div>
            )}

            {status === 'reconnecting' && (
              <div
                className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-amber-400/30 bg-amber-950/80 px-4 py-2 text-xs font-medium text-amber-100"
                role="status"
                aria-live="assertive"
              >
                Connection interrupted — trying to reconnect…
              </div>
            )}
          </>
        ) : null}

        {isOutgoing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
            <RemoteAvatar name={remoteName} />
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-100">Calling {remoteName}</p>
              <p className="mt-1 text-sm text-slate-400">Waiting for them to answer…</p>
            </div>
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent"
              aria-hidden="true"
            />
          </div>
        )}

        {isIncoming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
            <RemoteAvatar name={remoteName} />
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-100">{remoteName} is calling</p>
              <p className="mt-1 text-sm text-slate-400">Accept to start video and audio</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={rejectCall}
                className="rounded-full border border-rose-400/40 bg-rose-600/20 px-6 py-3 text-sm font-semibold text-rose-100 hover:bg-rose-600/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={acceptCall}
                className="rounded-full border border-emerald-400/40 bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Accept
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Press A to accept · Esc to decline</p>
          </div>
        )}

        {isTerminal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
            <RemoteAvatar name={remoteName} />
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-100">
                {status === 'failed' ? 'Call failed' : 'Call ended'}
              </p>
              <p className="mt-1 max-w-md text-sm text-slate-400">
                {error?.message ||
                  (status === 'failed'
                    ? 'The connection could not be established.'
                    : `Call with ${remoteName} has ended.`)}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissTerminal}
              className="rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Close
            </button>
          </div>
        )}

        {bannerError && !isTerminal ? (
          <div
            className="absolute left-1/2 top-4 z-20 w-[min(92vw,32rem)] -translate-x-1/2 rounded-xl border border-rose-400/30 bg-rose-950/90 px-4 py-3 text-left text-xs text-rose-100 shadow-lg backdrop-blur-sm"
            role="alert"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {error?.code === 'PERMISSION_DENIED' || error?.code === 'SCREEN_PERMISSION_DENIED'
                    ? 'Permission required'
                    : 'Something went wrong'}
                </p>
                <p className="mt-1 text-rose-100/90">{bannerError}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  clearError();
                }}
                className="shrink-0 rounded px-2 py-1 text-[11px] font-semibold underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer controls — fixed height */}
      <footer className="relative z-20 flex h-24 shrink-0 flex-col items-center justify-center gap-2 border-t border-white/5 bg-black/50 px-4 backdrop-blur-md">
        {inMediaSession || isOutgoing ? (
          <CallControls
            isMicEnabled={isMicEnabled}
            isCameraEnabled={isCameraEnabled}
            isScreenSharing={isScreenSharing}
            canToggleMedia={inMediaSession}
            onToggleMic={toggleMicrophone}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={handleScreenShare}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            onEndCall={endCall}
          />
        ) : null}

        {inMediaSession ? (
          <p className="hidden text-[10px] text-slate-500 sm:block">
            Shortcuts: M mute · C camera · S screen · F full screen · Esc end
          </p>
        ) : null}

        {isOutgoing ? (
          <p className="text-[10px] text-slate-500">Esc to cancel</p>
        ) : null}
      </footer>
    </div>
  );
}
