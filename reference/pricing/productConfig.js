export const products = {
  coro: "Coroplast Yard Signs",
  banner: "Vinyl Banners",
  meshBanner: "Mesh Banners",
  acm: "ACM / Maxmetal",
  acrylic: "Acrylic",
  vinyl: "Printed Vinyl",
  reflective: "Reflective Vinyl",
  poster: "Poster Paper",
  foamcore: "Foamcore",
};

export const acrylicOption = { name: "Acrylic", costPerSqIn: 0.1, minCost: 14.4 };
export const acrylicStandOffOptions = {
  silver: { name: "Silver", directEach: 2.5, retailEach: 4 },
  black: { name: "Black", directEach: 3.5, retailEach: 5 },
};

export const productCategories = [
  { name: "Signs & Banners", items: [
    { id: "coro", label: "Coroplast Yard Signs", calculator: "coro" },
    { id: "coroSigns", label: "Coro Signs", calculator: "coro" },
    { id: "banner", label: "Vinyl Banners", calculator: "banner" },
    { id: "meshBanner", label: "Mesh Banners", calculator: "meshBanner" },
    { id: "acm", label: "ACM / Maxmetal", calculator: "acm" },
    { id: "poster", label: "Poster Paper", calculator: "poster" },
    { id: "acrylic", label: "Acrylic", calculator: "acrylic" }, { id: "foamcore", label: "Foamcore", calculator: "foamcore" },
    { id: "pvc", label: "PVC", calculator: "pvc" }, { id: "polystyrene", label: "Polystyrene" },
    { id: "aluminum", label: "Aluminum" }, { id: "backlit", label: "Backlit" },
    { id: "vehicleMagnets", label: "Vehicle Magnets", calculator: "vehicleMagnets" },
  ] },
  { name: "Vinyl / Decals", items: [
    { id: "vinyl", label: "Printed Vinyl", calculator: "vinyl" },
    { id: "footprints", label: "Footprints Vinyl", calculator: "footprints" }, { id: "bootprints", label: "BootPrints Vinyl" },
    { id: "reflective", label: "Reflective Vinyl", calculator: "reflective" }, { id: "wallVinyl", label: "Wall Vinyl" },
    { id: "windowPerf", label: "Window Perforated Vinyl" }, { id: "staticCling", label: "Static Cling" },
    { id: "decals", label: "Decals / Stickers" },
  ] },
  { name: "Screen Printing", items: [
    { id: "screenPrinting", label: "Screen Printing", calculator: "screenPrinting" },
    { id: "dtfTransfers", label: "DTF Transfers", calculator: "dtfTransfers" },
    { id: "embroidery", label: "Embroidery" },
  ] },
  { name: "Paper Printing", items: [
    { id: "businessCards", label: "Business Cards", calculator: "businessCards" },
    { id: "handheld16ptPaper", label: "Handheld 16pt Paper", calculator: "handheld16ptPaper" },
    { id: "carbonless", label: "Carbonless Forms" },
    { id: "doorHangers", label: "Door Hangers" },
    { id: "notepads", label: "Notepads" },
    { id: "envelopes", label: "Envelopes" },
  ] },
];

export const bannerOptions = {
  "13-single": { name: "13oz Single-Sided", cost: 1.25, retail: 5 },
  "13-double": { name: "13oz Double-Sided", cost: 1.25, retail: 8 },
  "15-single": { name: "15oz Single-Sided", cost: 1.75, retail: 7 },
  "18-single": { name: "18oz Single-Sided", cost: 2.25, retail: 9 },
  "18-double": { name: "18oz Double-Sided", cost: 4.25, retail: 17 },
};
export const acmOptions = {
  "3-single": { name: "3mm Single-Sided", costPerSqIn: 0.05, minCost: 7.2 },
  "3-double": { name: "3mm Double-Sided", costPerSqIn: 0.06, minCost: 8.64 },
  "6-single": { name: "6mm Single-Sided", costPerSqIn: 0.08, minCost: 11.52 },
  "6-double": { name: "6mm Double-Sided", costPerSqIn: 0.09, minCost: 12.96 },
};
export const vinylOptions = {
  "gf-standard": { name: "GF 203OAPAE Standard Vinyl", cost: 2.49, retail: 8.75 },
  "3m-premium": { name: "3M IJ-35C Premium Vinyl", cost: 2.99, retail: 10.51 },
  "gf830-auto": { name: "GF830 AutoMark Vehicle Vinyl", cost: 3.99, retail: 14.02 },
  "3m-controltac": { name: "3M Controltac Premium Vehicle Vinyl", cost: 4.99, retail: 17.54 },
  "low-tac-wall": { name: "Low Tac Wall Vinyl", cost: 3.47, retail: 12.2 },
};

export const coroPricing = {
  single: [
    { min: 1, price: 25 },
    { min: 5, price: 15 },
    { min: 10, price: 13.75 },
    { min: 24, price: 10.75 },
    { min: 50, price: 9.9 },
    { min: 100, price: 8.25 },
  ],
  double: [
    { min: 1, price: 28 },
    { min: 5, price: 18 },
    { min: 10, price: 16.75 },
    { min: 24, price: 13.7 },
    { min: 50, price: 12.9 },
    { min: 100, price: 11.75 },
  ],
};
export const coroSheetCost = {
  single: [44, 33, 30],
  double: [55, 44, 40],
};

export const foamcoreSheetPricing = {
  single: [
    { max: 9, price: 70 },
    { max: 50, price: 55 },
    { max: Infinity, price: 50 },
  ],
  double: [
    { max: 9, price: 80 },
    { max: 50, price: 65 },
    { max: Infinity, price: 60 },
  ],
};

export const pvcSheetPricing = {
  "3-single": [
    { max: 9, price: 65 },
    { max: 17, price: 55 },
    { max: Infinity, price: 50 },
  ],
  "3-double": [
    { max: 9, price: 85 },
    { max: 17, price: 70 },
    { max: Infinity, price: 60 },
  ],
  "6-single": [
    { max: 9, price: 95 },
    { max: 17, price: 85 },
    { max: Infinity, price: 75 },
  ],
  "6-double": [
    { max: 9, price: 115 },
    { max: 17, price: 100 },
    { max: Infinity, price: 85 },
  ],
};

export const pvcOptions = {
  "3-single": { name: "3mm Single-Sided" },
  "3-double": { name: "3mm Double-Sided" },
  "6-single": { name: "6mm Single-Sided" },
  "6-double": { name: "6mm Double-Sided" },
};
