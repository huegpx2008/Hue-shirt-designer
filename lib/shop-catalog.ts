export type ShopProductType = 'featured' | 'group';
export type ShopStoreVisibility = 'public' | 'unlisted';
export type ShopOptionType = 'text' | 'select';

export type ShopOptionDefinition = {
  id: string;
  label: string;
  type: ShopOptionType;
  required?: boolean;
  placeholder?: string;
  choices?: string[];
};

export type ShopProduct = {
  id: string;
  storeId?: string | null;
  productType: ShopProductType;
  slug: string;
  title: string;
  eyebrow?: string;
  shortDescription: string;
  description?: string;
  imageUrl?: string;
  basePrice: number;
  active: boolean;
  options: ShopOptionDefinition[];
  createdAt?: string;
  updatedAt?: string;
};

export type GroupStore = {
  id: string;
  slug: string;
  name: string;
  organization?: string;
  description: string;
  heroImageUrl?: string;
  visibility: ShopStoreVisibility;
  opensAt?: string | null;
  closesAt?: string | null;
  active: boolean;
  deliveryNote?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ShopCatalogPayload = {
  configured: boolean;
  previewMode?: boolean;
  featuredProducts: ShopProduct[];
  groupStores: GroupStore[];
  groupProducts: ShopProduct[];
  message?: string;
};

export type ShopCartSelection = {
  product: ShopProduct;
  store?: GroupStore | null;
  quantity: number;
  selections: Record<string, string>;
};

export const normalizeShopSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

export const isGroupStoreOpen = (store: GroupStore, now = new Date()) => {
  if (!store.active) return false;
  const opensAt = store.opensAt ? new Date(store.opensAt) : null;
  const closesAt = store.closesAt ? new Date(store.closesAt) : null;
  if (opensAt && !Number.isNaN(opensAt.getTime()) && now < opensAt) return false;
  if (closesAt && !Number.isNaN(closesAt.getTime()) && now > closesAt) return false;
  return true;
};

export const SHOP_PREVIEW_CATALOG: ShopCatalogPayload = {
  configured: false,
  previewMode: true,
  message: 'Shop preview mode is active. Add the Shop tables in Supabase, then publish products from Studio Admin.',
  featuredProducts: [
    {
      id: 'preview-graduation-banner',
      productType: 'featured',
      slug: 'senior-graduation-banner',
      title: 'Senior Graduation Banner',
      eyebrow: 'Graduation season',
      shortDescription: 'Choose a design, add the graduate details, and upload a favorite photo for a custom proof.',
      description: 'A ready-to-personalize graduation banner with a customer proof before production.',
      imageUrl: '/template-thumbnails/school-bold-graduate.svg',
      basePrice: 0,
      active: false,
      options: [
        { id: 'graduate-name', label: 'Graduate name', type: 'text', required: true, placeholder: 'Graduate name' },
        { id: 'school', label: 'School', type: 'text', required: true, placeholder: 'School name' },
        { id: 'size', label: 'Banner size', type: 'select', required: true, choices: ['2 ft × 4 ft', '3 ft × 6 ft', '4 ft × 8 ft'] },
      ],
    },
    {
      id: 'preview-ready-shirt',
      productType: 'featured',
      slug: 'hue-ready-to-sell-shirt',
      title: 'Ready-to-Sell Hue Shirt',
      eyebrow: 'Limited design',
      shortDescription: 'A finished shirt design with straightforward color and size choices.',
      imageUrl: '/apparel-dtf.svg',
      basePrice: 0,
      active: false,
      options: [
        { id: 'shirt-size', label: 'Shirt size', type: 'select', required: true, choices: ['Small', 'Medium', 'Large', 'XL', '2XL', '3XL'] },
      ],
    },
  ],
  groupStores: [
    {
      id: 'preview-walmart-market-21',
      slug: 'walmart-market-21',
      name: 'Walmart Market 21 Employee Store',
      organization: 'Walmart Market 21',
      description: 'Employees order and pay individually during a scheduled ordering window. Finished orders are produced together after the store closes.',
      visibility: 'unlisted',
      active: false,
      deliveryNote: 'Group delivery to the store coordinator.',
    },
    {
      id: 'preview-cpa',
      slug: 'citizens-police-academy',
      name: 'Citizens Police Academy Store',
      organization: 'Citizens Police Academy',
      description: 'A temporary group store for approved CPA apparel and individual employee checkout.',
      visibility: 'unlisted',
      active: false,
      deliveryNote: 'Orders are produced together after the deadline.',
    },
  ],
  groupProducts: [],
};

