function ControlButton({
  label,
  pressed,
  danger = false,
  active = false,
  disabled = false,
  onClick,
  children,
  shortcut,
}) {
  const base =
    'relative inline-flex h-12 w-12 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 sm:h-14 sm:w-14';

  let tone = 'border-white/15 bg-white/10 text-white hover:bg-white/20 focus-visible:ring-violet-400';
  if (danger) {
    tone = 'border-rose-400/40 bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-400';
  } else if (pressed) {
    tone = 'border-rose-400/50 bg-rose-950/80 text-rose-100 hover:bg-rose-900 focus-visible:ring-rose-400';
  } else if (active) {
    tone = 'border-emerald-400/40 bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/45 focus-visible:ring-emerald-400';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={typeof pressed === 'boolean' ? pressed : undefined}
      title={shortcut ? `${label} · ${shortcut}` : label}
      className={`${base} ${tone}`}
    >
      {children}
    </button>
  );
}

export default function CallControls({
  isMicEnabled,
  isCameraEnabled,
  isScreenSharing,
  canToggleMedia,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleFullscreen,
  isFullscreen,
  onEndCall,
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-3 sm:gap-4"
      role="toolbar"
      aria-label="Call controls"
    >
      <ControlButton
        label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
        pressed={!isMicEnabled}
        disabled={!canToggleMedia}
        onClick={onToggleMic}
        shortcut="M"
      >
        {isMicEnabled ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z" />
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0M12 18v3" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M9 9v3a3 3 0 005.12 2.12M15 9.5V6a3 3 0 00-5.8-1" />
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-9.9 6.4M12 18v3" />
          </svg>
        )}
      </ControlButton>

      <ControlButton
        label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        pressed={!isCameraEnabled}
        disabled={!canToggleMedia || isScreenSharing}
        onClick={onToggleCamera}
        shortcut="C"
      >
        {isCameraEnabled && !isScreenSharing ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.5-2.5v9L15 14M5 8h8a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4a2 2 0 012-2z" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M15 10l1.5-.8M19.5 7.5v9L15 14M5 8h.5M13 16H5a2 2 0 01-2-2v-4a2 2 0 012-2h5" />
          </svg>
        )}
      </ControlButton>

      <ControlButton
        label={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
        active={isScreenSharing}
        disabled={!canToggleMedia}
        onClick={onToggleScreenShare}
        shortcut="S"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
        </svg>
      </ControlButton>

      <ControlButton
        label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
        onClick={onToggleFullscreen}
        shortcut="F"
      >
        {isFullscreen ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 9H5V5M15 9h4V5M9 15H5v4M15 15h4v4" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6" />
          </svg>
        )}
      </ControlButton>

      <ControlButton label="End call" danger onClick={onEndCall} shortcut="Esc">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
        </svg>
      </ControlButton>
    </div>
  );
}
