import { useEffect, useMemo, useRef, useState } from 'react';

function hasLiveVideo(stream) {
  if (!stream) return false;
  return stream.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled);
}

/**
 * Binds a real MediaStream to a <video> element.
 * Shows an avatar fallback when the stream has no enabled live video track
 * (missing remote video / camera disabled) — never uses fake streams.
 */
export default function VideoStream({
  stream,
  muted = false,
  mirror = false,
  className = '',
  label,
  avatarName = '',
  emptyMessage = 'No video',
  fit = 'cover',
}) {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  const initials = useMemo(() => {
    const name = (avatarName || label || '?').trim();
    return name.charAt(0).toUpperCase() || '?';
  }, [avatarName, label]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    video.srcObject = stream ?? null;

    const syncVideoPresence = () => {
      setHasVideo(hasLiveVideo(stream));
    };

    syncVideoPresence();

    const tracks = stream?.getVideoTracks() || [];
    const onTrackEvent = () => syncVideoPresence();
    tracks.forEach((track) => {
      track.addEventListener('mute', onTrackEvent);
      track.addEventListener('unmute', onTrackEvent);
      track.addEventListener('ended', onTrackEvent);
    });

    if (stream) {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {
          // Autoplay may be blocked until a user gesture.
        });
      }
    }

    return () => {
      tracks.forEach((track) => {
        track.removeEventListener('mute', onTrackEvent);
        track.removeEventListener('unmute', onTrackEvent);
        track.removeEventListener('ended', onTrackEvent);
      });
      video.srcObject = null;
    };
  }, [stream]);

  // Re-check when track.enabled flips without a new stream identity
  useEffect(() => {
    setHasVideo(hasLiveVideo(stream));
  }, [stream, stream?.active]);

  return (
    <div className={`relative overflow-hidden bg-slate-950 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        aria-label={label || 'Video stream'}
        className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${
          mirror ? 'scale-x-[-1]' : ''
        } ${hasVideo ? 'opacity-100' : 'opacity-0'}`}
      />

      {!hasVideo ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-900 to-slate-950 px-4 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-2xl font-semibold text-slate-200 ring-1 ring-slate-700 sm:h-20 sm:w-20 sm:text-3xl"
            aria-hidden="true"
          >
            {initials}
          </div>
          <p className="text-sm text-slate-400">{emptyMessage}</p>
        </div>
      ) : null}

      {label ? (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-slate-100">
          {label}
        </span>
      ) : null}
    </div>
  );
}
