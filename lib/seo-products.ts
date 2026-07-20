export type SeoProduct = {
  slug: string;
  name: string;
  category: string;
  eyebrow: string;
  description: string;
  introduction: string;
  features: string[];
  bestFor: string[];
  keywords: string[];
};

export const SEO_PRODUCTS: SeoProduct[] = [
  {
    slug: 'custom-vinyl-banners',
    name: 'Custom Vinyl Banners',
    category: 'Banners',
    eyebrow: 'Full-color indoor and outdoor banners',
    description: 'Design or upload custom vinyl banner artwork, choose a finished size and order online through Hue Studio.',
    introduction: 'Hue Studio makes custom banner ordering straightforward: upload print-ready artwork, build a simple design in Hue Designer, or import a saved Canva project before selecting your banner options.',
    features: ['13 oz, 15 oz and 18 oz vinyl options', 'Custom width and height', 'Single- or double-sided ordering', 'Artwork fit review before checkout'],
    bestFor: ['Events and grand openings', 'Business promotions', 'Schools and sports', 'Indoor and outdoor displays'],
    keywords: ['custom banners', 'vinyl banner printing', 'outdoor banners', 'business banners'],
  },
  {
    slug: 'mesh-banners',
    name: 'Custom Mesh Banners',
    category: 'Banners',
    eyebrow: 'Air-flow banner material for exposed locations',
    description: 'Order custom mesh banners made from durable 8 oz coated polyester with 37% air-flow perforation.',
    introduction: 'Mesh banners are built for fences and other outdoor locations where air flow matters. Upload your finished layout and confirm its fit in Hue Studio before ordering.',
    features: ['8 oz coated polyester mesh', '37% air-flow perforation', 'Custom finished sizes', 'Online artwork and pricing review'],
    bestFor: ['Fence graphics', 'Outdoor events', 'Construction sites', 'Wind-exposed displays'],
    keywords: ['mesh banners', 'fence banner printing', 'perforated banner', 'outdoor mesh signs'],
  },
  {
    slug: 'yard-signs',
    name: 'Custom Yard Signs',
    category: 'CORO',
    eyebrow: 'Lightweight 4 mm coroplast signs',
    description: 'Create and order custom coroplast yard signs with sheet-based pricing and a visual production layout.',
    introduction: 'Upload an approved sign or start with Hue Designer, then see how your signs map onto a production sheet. The standard starting size is 24 x 18 inches, with custom sizes also available.',
    features: ['4 mm coroplast material', '24 x 18 inch starting size', 'Custom sizes and quantities', 'Visual 48 x 96 inch sheet layout'],
    bestFor: ['Yard and lawn signs', 'Real estate signs', 'Political signs', 'Directional and event signs'],
    keywords: ['yard signs', 'coroplast signs', 'custom lawn signs', 'political sign printing'],
  },
  {
    slug: 'rigid-signs',
    name: 'Custom Rigid Signs',
    category: 'Rigid Signs',
    eyebrow: 'Printed panels for indoor and outdoor use',
    description: 'Order custom acrylic, ACM, PVC, foamcore, polystyrene and aluminum signs through Hue Studio.',
    introduction: 'Choose the rigid material that fits the job, upload or create artwork, confirm dimensions and review the production-ready layout before checkout.',
    features: ['Acrylic, ACM, PVC and aluminum options', 'Foamcore and polystyrene panels', 'Material-specific thickness choices', 'Single- and double-sided options where available'],
    bestFor: ['Business and wall signs', 'Directional signs', 'Display panels', 'Parking and regulatory signs'],
    keywords: ['rigid signs', 'ACM signs', 'PVC sign printing', 'aluminum signs', 'acrylic signs'],
  },
  {
    slug: 'adhesive-vinyl',
    name: 'Custom Adhesive Vinyl',
    category: 'Decals',
    eyebrow: 'Printed decals and window graphics',
    description: 'Upload print-ready artwork and order custom adhesive vinyl graphics with online fit checks.',
    introduction: 'Hue Studio provides a focused ordering path for adhesive vinyl: add your artwork, set the final size and review how it fits before checkout.',
    features: ['Custom dimensions', 'Print-ready artwork upload', 'Hue Designer editing tools', 'Online size and fit review'],
    bestFor: ['Window graphics', 'Business decals', 'Equipment labels', 'Promotional graphics'],
    keywords: ['adhesive vinyl', 'custom decals', 'window graphics', 'vinyl sticker printing'],
  },
  {
    slug: 'vehicle-magnets',
    name: 'Custom Vehicle Magnets',
    category: 'Magnets',
    eyebrow: 'Removable, reusable mobile advertising',
    description: 'Create custom vehicle magnets with artwork checks, custom sizing and rounded-corner options.',
    introduction: 'Turn a car, truck or work vehicle into a removable advertising display. Upload an existing design or create a simple layout in Hue Designer.',
    features: ['Custom finished sizes', 'Rounded-corner options', 'Reusable magnetic material', 'Artwork preview before ordering'],
    bestFor: ['Service vehicles', 'Contractors and trades', 'Local delivery vehicles', 'Temporary fleet branding'],
    keywords: ['vehicle magnets', 'custom car magnets', 'truck door magnets', 'business vehicle signs'],
  },
  {
    slug: 'business-cards',
    name: 'Custom Business Cards',
    category: 'More',
    eyebrow: 'Professional cards from uploaded or editable artwork',
    description: 'Order custom business cards with single- or double-sided printing and built-in Hue Designer templates.',
    introduction: 'Start with finished artwork or customize a business card template. Hue Studio keeps the finished size, orientation, coating and front/back artwork clear throughout ordering.',
    features: ['Landscape and portrait orientation', 'Single- or double-sided printing', 'Coating choices', 'Editable business card starter templates'],
    bestFor: ['Small businesses', 'Sales and networking', 'Appointment cards', 'QR-code contact cards'],
    keywords: ['business card printing', 'custom business cards', 'double sided business cards', 'business card templates'],
  },
  {
    slug: 'poster-printing',
    name: 'Custom Poster Printing',
    category: 'More',
    eyebrow: 'Bright white paper with a smooth satin finish',
    description: 'Order custom posters printed on 8 mil bright white paper with a smooth satin finish.',
    introduction: 'Upload a poster layout, set its final dimensions and review the artwork fit online. The bright white surface is suited to crisp type and vivid full-color graphics.',
    features: ['8 mil bright white paper', 'Smooth satin finish', 'Custom poster dimensions', 'Online artwork fit review'],
    bestFor: ['Event posters', 'Retail displays', 'Indoor promotions', 'Presentation graphics'],
    keywords: ['poster printing', 'custom posters', 'business posters', 'event poster printing'],
  },
];

export const getSeoProduct = (slug: string) => SEO_PRODUCTS.find((product) => product.slug === slug);
