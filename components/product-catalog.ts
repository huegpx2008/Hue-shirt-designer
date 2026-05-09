export type ProductView = 'front' | 'back';

export type PrintLocation = 'full-front' | 'left-chest' | 'full-back';

export type ProductCatalogItem = {
  id: string;
  name: string;
  styleNumber: string;
  category: string;
  availableColors: ReadonlyArray<{ name: string; value: string }>;
  mockups: {
    front: string;
    back: string;
  };
  defaultPrintLocations: ReadonlyArray<PrintLocation>;
};

const COMMON_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#111111' },
  { name: 'Athletic Gray', value: '#9ca3af' },
  { name: 'Navy', value: '#1f365f' },
  { name: 'Red', value: '#b91c1c' }
] as const;

export const SAMPLE_PRODUCT_CATALOG: ReadonlyArray<ProductCatalogItem> = [
  {
    id: 'basic-short-sleeve-tee',
    name: 'Basic Short Sleeve Tee',
    styleNumber: 'ST-0001',
    category: 'T-Shirt',
    availableColors: COMMON_COLORS,
    mockups: {
      front: 'M92 52 138 28h104l46 24 44 56-39 30-29-35v254c0 11-9 20-20 20H116c-11 0-20-9-20-20V155l-29 35-39-30 44-56z',
      back: 'M96 52 138 30h104l42 24 44 54-37 30-31-36v255c0 11-9 20-20 20H116c-11 0-20-9-20-20V154l-31 36-37-30 44-54z'
    },
    defaultPrintLocations: ['full-front', 'left-chest']
  },
  {
    id: 'long-sleeve-tee',
    name: 'Long Sleeve Tee',
    styleNumber: 'ST-0002',
    category: 'T-Shirt',
    availableColors: COMMON_COLORS,
    mockups: {
      front: 'M94 54 138 30h104l44 24 70 90-37 28-51-66v249c0 11-9 20-20 20H132c-11 0-20-9-20-20V160l-51 66-37-28 70-90z',
      back: 'M100 54 138 32h104l42 22 66 86-35 28-48-62v251c0 11-9 20-20 20H133c-11 0-20-9-20-20V160l-48 62-35-28 66-86z'
    },
    defaultPrintLocations: ['full-front', 'full-back']
  },
  {
    id: 'hoodie',
    name: 'Hoodie',
    styleNumber: 'ST-0003',
    category: 'Fleece',
    availableColors: COMMON_COLORS,
    mockups: {
      front: 'M98 62 142 30h96l44 32 42 54-37 29-31-40v304c0 11-9 20-20 20H144c-11 0-20-9-20-20V105l-31 40-37-29 42-54z',
      back: 'M102 62 142 32h96l42 30 40 52-35 28-30-38v305c0 11-9 20-20 20H145c-11 0-20-9-20-20V104l-30 38-35-28 40-52z'
    },
    defaultPrintLocations: ['full-front', 'full-back']
  },
  {
    id: 'crewneck-sweatshirt',
    name: 'Crewneck Sweatshirt',
    styleNumber: 'ST-0004',
    category: 'Fleece',
    availableColors: COMMON_COLORS,
    mockups: {
      front: 'M104 64 140 36h100l36 28 54 68-34 26-40-50v287c0 11-9 20-20 20H144c-11 0-20-9-20-20V144l-40 50-34-26 54-68z',
      back: 'M106 64 140 38h100l34 26 52 66-32 26-40-50v289c0 11-9 20-20 20H146c-11 0-20-9-20-20V146l-40 50-32-26 52-66z'
    },
    defaultPrintLocations: ['full-front', 'left-chest', 'full-back']
  },
  {
    id: 'polo',
    name: 'Polo',
    styleNumber: 'ST-0005',
    category: 'Polos',
    availableColors: [
      { name: 'White', value: '#ffffff' },
      { name: 'Black', value: '#111111' },
      { name: 'Royal', value: '#1d4ed8' },
      { name: 'Forest', value: '#166534' },
      { name: 'Burgundy', value: '#7f1d1d' }
    ],
    mockups: {
      front: 'M100 58 138 32h104l38 26 44 56-37 29-28-36v252c0 11-9 20-20 20H141c-11 0-20-9-20-20V165l-28 36-37-29 44-56z',
      back: 'M104 58 138 34h104l36 24 44 54-35 28-30-36v254c0 11-9 20-20 20H143c-11 0-20-9-20-20V164l-30 36-35-28 44-54z'
    },
    defaultPrintLocations: ['left-chest', 'full-back']
  }
] as const;

export const PRINT_AREA_CONFIG: Record<PrintLocation, { label: string; top: number; left: number; width: number; height: number }> = {
  'full-front': { label: 'Full Front', top: 132, left: 80, width: 220, height: 240 },
  'left-chest': { label: 'Left Chest', top: 152, left: 118, width: 110, height: 110 },
  'full-back': { label: 'Full Back', top: 126, left: 80, width: 220, height: 250 }
};
