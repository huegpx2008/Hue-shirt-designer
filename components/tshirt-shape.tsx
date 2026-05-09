interface TshirtShapeProps {
  color: string;
  bodyPath: string;
  view: 'front' | 'back';
}

export default function TshirtShape({ color, bodyPath, view }: TshirtShapeProps) {
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
