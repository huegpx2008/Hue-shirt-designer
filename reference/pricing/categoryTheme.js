const defaultTheme = {
  key: "default",
  accent: "#38bdf8",
  accentSoft: "rgba(56,189,248,0.3)",
  accentGlow: "rgba(56,189,248,0.25)",
  divider: "rgba(56,189,248,0.35)",
  summaryBorder: "rgba(56,189,248,0.55)",
  mobileTint: "rgba(56,189,248,0.16)",
};

const themes = {
  dtf: { key: "dtf", accent: "#22d3ee", accentSoft: "rgba(34,211,238,0.32)", accentGlow: "rgba(34,211,238,0.26)", divider: "rgba(34,211,238,0.35)", summaryBorder: "rgba(34,211,238,0.58)", mobileTint: "rgba(34,211,238,0.16)" },
  screen: { key: "screen", accent: "#f59e0b", accentSoft: "rgba(245,158,11,0.32)", accentGlow: "rgba(245,158,11,0.25)", divider: "rgba(245,158,11,0.35)", summaryBorder: "rgba(245,158,11,0.55)", mobileTint: "rgba(245,158,11,0.16)" },
  coroplast: { key: "coroplast", accent: "#22c55e", accentSoft: "rgba(34,197,94,0.3)", accentGlow: "rgba(34,197,94,0.24)", divider: "rgba(34,197,94,0.34)", summaryBorder: "rgba(34,197,94,0.52)", mobileTint: "rgba(34,197,94,0.16)" },
  rigid: { key: "rigid", accent: "#60a5fa", accentSoft: "rgba(96,165,250,0.32)", accentGlow: "rgba(96,165,250,0.24)", divider: "rgba(96,165,250,0.34)", summaryBorder: "rgba(96,165,250,0.56)", mobileTint: "rgba(96,165,250,0.16)" },
  vinyl: { key: "vinyl", accent: "#a78bfa", accentSoft: "rgba(167,139,250,0.32)", accentGlow: "rgba(167,139,250,0.25)", divider: "rgba(167,139,250,0.34)", summaryBorder: "rgba(167,139,250,0.56)", mobileTint: "rgba(167,139,250,0.16)" },
  banners: { key: "banners", accent: "#ef4444", accentSoft: "rgba(239,68,68,0.3)", accentGlow: "rgba(239,68,68,0.24)", divider: "rgba(239,68,68,0.33)", summaryBorder: "rgba(239,68,68,0.55)", mobileTint: "rgba(239,68,68,0.16)" },
  paper: { key: "paper", accent: "#67e8f9", accentSoft: "rgba(103,232,249,0.3)", accentGlow: "rgba(103,232,249,0.23)", divider: "rgba(103,232,249,0.34)", summaryBorder: "rgba(103,232,249,0.56)", mobileTint: "rgba(103,232,249,0.15)" },
  magnets: { key: "magnets", accent: "#d4a017", accentSoft: "rgba(212,160,23,0.3)", accentGlow: "rgba(212,160,23,0.24)", divider: "rgba(212,160,23,0.34)", summaryBorder: "rgba(212,160,23,0.56)", mobileTint: "rgba(212,160,23,0.15)" },
};

const productThemeMap = {
  dtfTransfers: themes.dtf,
  screenPrinting: themes.screen,
  coro: themes.coroplast,
  coroSigns: themes.coroplast,
  banner: themes.banners,
  meshBanner: themes.banners,
  acm: themes.rigid,
  acrylic: themes.rigid,
  aluminum: themes.rigid,
  foamcore: themes.rigid,
  pvc: themes.rigid,
  vinyl: themes.vinyl,
  reflective: themes.vinyl,
  footprints: { ...themes.vinyl, key: "footprints", accent: "#2dd4bf", accentSoft: "rgba(45,212,191,0.32)", accentGlow: "rgba(45,212,191,0.26)", divider: "rgba(45,212,191,0.35)", summaryBorder: "rgba(45,212,191,0.58)", mobileTint: "rgba(45,212,191,0.16)" },
  decals: themes.vinyl,
  poster: themes.paper,
  businessCards: { ...themes.paper, key: "businessCards", accent: "#e2e8f0", accentSoft: "rgba(226,232,240,0.38)", accentGlow: "rgba(226,232,240,0.28)", divider: "rgba(226,232,240,0.38)", summaryBorder: "rgba(226,232,240,0.62)", mobileTint: "rgba(226,232,240,0.2)" },
  handheld16ptPaper: { ...themes.screen, key: "handheld16ptPaper", accent: "#f59e0b", accentSoft: "rgba(245,158,11,0.35)", accentGlow: "rgba(245,158,11,0.26)", divider: "rgba(245,158,11,0.38)", summaryBorder: "rgba(245,158,11,0.58)", mobileTint: "rgba(245,158,11,0.2)" },
  vehicleMagnets: themes.magnets,
};

export function getCategoryTheme(productId) {
  return productThemeMap[productId] || defaultTheme;
}
