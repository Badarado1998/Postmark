/** Postmark mark: a postage stamp with pixel-perforated edges and a bold check. */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className}
      role="img" aria-label="Postmark">
      {/* perforated edge: paper notches punched out of a green square */}
      <g>
        <rect x="2" y="2" width="28" height="28" rx="2" fill="#23663f" />
        {Array.from({ length: 7 }).map((_, i) => (
          <g key={i} fill="#f3f3ee">
            <rect x={4 + i * 4} y={0} width="2" height="3" />
            <rect x={4 + i * 4} y={29} width="2" height="3" />
            <rect x={0} y={4 + i * 4} width="3" height="2" />
            <rect x={29} y={4 + i * 4} width="3" height="2" />
          </g>
        ))}
      </g>
      <rect x="6" y="6" width="20" height="20" fill="none" stroke="#ddc362" strokeWidth="1.5" />
      <path d="M10 17l4.5 4.5L22.5 11" fill="none" stroke="#f3f3ee"
        strokeWidth="3.2" strokeLinecap="square" />
    </svg>
  );
}
