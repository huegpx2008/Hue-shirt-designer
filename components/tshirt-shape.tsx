interface TshirtShapeProps {
  color: string;
}

export default function TshirtShape({ color }: TshirtShapeProps) {
  return (
    <svg viewBox="0 0 380 440" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="shirtShade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.13)" />
        </linearGradient>
      </defs>
      <path
        d="M85 42 133 20h114l48 22 53 58-46 32-26-33v306H104V99l-26 33-46-32z"
        fill={color}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="4"
      />
      <path
        d="M141 20c0 31 14 47 49 47s49-16 49-47"
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M85 42 133 20h114l48 22 53 58-46 32-26-33v306H104V99l-26 33-46-32z" fill="url(#shirtShade)" />
    </svg>
  );
}
