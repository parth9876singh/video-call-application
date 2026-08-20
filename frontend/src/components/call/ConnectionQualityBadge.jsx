const LEVEL_STYLES = {
  excellent: { bar: 'bg-emerald-400', label: 'Excellent' },
  good: { bar: 'bg-lime-400', label: 'Good' },
  fair: { bar: 'bg-amber-400', label: 'Fair' },
  poor: { bar: 'bg-rose-400', label: 'Poor' },
  unknown: { bar: 'bg-slate-500', label: 'Measuring' },
};

const LEVEL_BARS = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
  unknown: 0,
};

export default function ConnectionQualityBadge({ quality, reconnecting = false }) {
  const level = reconnecting ? 'poor' : quality?.level || 'unknown';
  const meta = LEVEL_STYLES[level] || LEVEL_STYLES.unknown;
  const filled = LEVEL_BARS[level] ?? 0;
  const rtt = quality?.rttMs;
  const loss = quality?.packetLoss;

  const detailParts = [];
  if (typeof rtt === 'number') detailParts.push(`${rtt} ms`);
  if (typeof loss === 'number') detailParts.push(`${Math.round(loss * 100)}% loss`);
  const detail = detailParts.join(' · ');

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] text-slate-200 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      title={detail || meta.label}
    >
      <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`w-0.5 rounded-sm ${n <= filled ? meta.bar : 'bg-slate-600'} ${
              n === 1 ? 'h-1' : n === 2 ? 'h-1.5' : n === 3 ? 'h-2' : 'h-2.5'
            }`}
          />
        ))}
      </span>
      <span className="font-medium">
        {reconnecting ? 'Reconnecting' : meta.label}
      </span>
      {detail && !reconnecting ? (
        <span className="hidden text-slate-400 sm:inline">{detail}</span>
      ) : null}
    </div>
  );
}
