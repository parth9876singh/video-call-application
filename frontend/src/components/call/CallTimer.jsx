function formatDuration(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export default function CallTimer({ seconds, className = '' }) {
  return (
    <time
      className={`font-mono tabular-nums tracking-wide text-slate-200 ${className}`}
      dateTime={`PT${Math.max(0, seconds || 0)}S`}
      aria-live="off"
      aria-label={`Call duration ${formatDuration(seconds)}`}
    >
      {formatDuration(seconds)}
    </time>
  );
}
