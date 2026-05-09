interface TshirtShapeProps {
  color: string;
  bodyPath: string;
  view: 'front' | 'back';
}

export default function TshirtShape({ color, bodyPath, view }: TshirtShapeProps) {
  return (
    <svg viewBox="0 0 380 440" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="fabricLight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.26)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(2,6,23,0.22)" />
        </linearGradient>
        <filter id="drop" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="16" stdDeviation="10" floodColor="#0f172a" floodOpacity="0.25" />
        </filter>
      </defs>
      <ellipse cx="190" cy="420" rx="120" ry="16" fill="rgba(15,23,42,0.16)" />
      <g filter="url(#drop)">
        <path d={bodyPath} fill={color} stroke="rgba(15,23,42,0.22)" strokeWidth="2.5" />
        <path d={bodyPath} fill="url(#fabricLight)" />
        <path d="M90 120c20-12 54-20 100-20s80 8 100 20" stroke="rgba(255,255,255,0.2)" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M120 170c22 18 46 22 70 22s48-4 70-22" stroke="rgba(15,23,42,0.12)" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M126 225c16 12 36 16 64 16" stroke="rgba(255,255,255,0.14)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M252 225c-16 12-36 16-64 16" stroke="rgba(15,23,42,0.14)" strokeWidth="4" fill="none" strokeLinecap="round" />
        {view === 'front' ? (
          <path d="M160 54c7 8 16 12 30 12s24-4 30-12" stroke="rgba(15,23,42,0.3)" strokeWidth="5" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M146 56h88" stroke="rgba(15,23,42,0.28)" strokeWidth="6" fill="none" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}
