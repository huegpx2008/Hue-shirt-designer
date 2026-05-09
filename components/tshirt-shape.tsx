interface TshirtShapeProps {
  color: string;
  style: 'short-sleeve-tee' | 'long-sleeve-tee' | 'hoodie';
  view: 'front' | 'back';
}

const SHIRT_PATHS = {
  'short-sleeve-tee': 'M92 52 138 28h104l46 24 44 56-39 30-29-35v254c0 11-9 20-20 20H116c-11 0-20-9-20-20V155l-29 35-39-30 44-56z',
  'long-sleeve-tee': 'M94 54 138 30h104l44 24 70 90-37 28-51-66v249c0 11-9 20-20 20H132c-11 0-20-9-20-20V160l-51 66-37-28 70-90z',
  hoodie: 'M98 62 142 30h96l44 32 42 54-37 29-31-40v304c0 11-9 20-20 20H144c-11 0-20-9-20-20V105l-31 40-37-29 42-54z'
} as const;

export default function TshirtShape({ color, style, view }: TshirtShapeProps) {
  const bodyPath = SHIRT_PATHS[style];

  return (
    <svg viewBox="0 0 380 440" className="h-full w-full drop-shadow-[0_18px_30px_rgba(15,23,42,0.18)]" aria-hidden>
      <defs>
        <linearGradient id="shirtShade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.24)" />
          <stop offset="100%" stopColor="rgba(15,23,42,0.18)" />
        </linearGradient>
      </defs>
      <rect x="48" y="24" width="284" height="396" rx="34" fill="white" opacity="0.7" />
      <path d={bodyPath} fill={color} stroke="rgba(15,23,42,0.18)" strokeWidth="3" />
      <path d={bodyPath} fill="url(#shirtShade)" />
      {view === 'back' ? <path d="M145 46h90" stroke="rgba(15,23,42,0.2)" strokeWidth="6" strokeLinecap="round" /> : null}
    </svg>
  );
}
