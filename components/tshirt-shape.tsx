interface TshirtShapeProps {
  color: string;
  style: 'short-sleeve-tee' | 'long-sleeve-tee' | 'hoodie';
  view: 'front' | 'back';
}

const SHIRT_PATHS = {
  'short-sleeve-tee': 'M85 42 133 20h114l48 22 53 58-46 32-26-33v306H104V99l-26 33-46-32z',
  'long-sleeve-tee': 'M88 45 133 24h114l45 21 72 89-42 31-52-64v306H110V101l-52 64-42-31z',
  hoodie: 'M97 57 139 26h102l42 31 45 56-40 31-30-37v300H122V107l-30 37-40-31z'
} as const;

export default function TshirtShape({ color, style, view }: TshirtShapeProps) {
  const bodyPath = SHIRT_PATHS[style];

  return (
    <svg viewBox="0 0 380 440" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="shirtShade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.13)" />
        </linearGradient>
      </defs>

      <path d={bodyPath} fill={color} stroke="rgba(0,0,0,0.2)" strokeWidth="4" />

      {style !== 'hoodie' ? (
        <path
          d="M141 22c0 31 14 47 49 47s49-16 49-47"
          fill="none"
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M130 40c7 24 25 37 60 37s53-13 60-37"
            fill="none"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {view === 'front' ? (
            <path
              d="M145 150h90v48h-90z"
              fill="rgba(0,0,0,0.08)"
              stroke="rgba(0,0,0,0.08)"
              strokeWidth="2"
              rx="8"
            />
          ) : null}
        </>
      )}

      {view === 'back' ? (
        <path d="M148 36h84" stroke="rgba(0,0,0,0.1)" strokeWidth="6" strokeLinecap="round" />
      ) : null}

      <path d={bodyPath} fill="url(#shirtShade)" />
    </svg>
  );
}
