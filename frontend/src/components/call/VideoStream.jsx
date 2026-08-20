import { useEffect, useRef } from 'react';

/**
 * Binds a MediaStream to a <video> element and clears it on unmount / stream change.
 * Use muted + playsInline for local preview to avoid echo and autoplay blocks.
 */
export default function VideoStream({
  stream,
  muted = false,
  mirror = false,
  className = '',
  label,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    video.srcObject = stream ?? null;

    if (stream) {
      // Some browsers need an explicit play() after srcObject is set
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {
          // Autoplay can fail until a user gesture; UI can retry later.
        });
      }
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={`relative overflow-hidden bg-slate-950 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`}
      />
      {label ? (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/55 px-2 py-0.5 text-xs text-slate-100">
          {label}
        </span>
      ) : null}
      {!stream ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          No video
        </div>
      ) : null}
    </div>
  );
}
