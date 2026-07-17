import rawTemplateCatalog from '@/data/hue-template-catalog.json';

export const SMART_TEMPLATE_CATEGORIES = ['Real Estate', 'Business', 'Contractors', 'Events', 'Parking & Directional'] as const;
export const SMART_TEMPLATE_STYLES = ['Modern', 'Bold', 'Premium', 'Minimal', 'Industrial', 'Classic', 'Luxury', 'Playful'] as const;
export const SMART_TEMPLATE_LAYOUTS = ['band', 'split', 'frame'] as const;

export type SmartTemplateCategory = (typeof SMART_TEMPLATE_CATEGORIES)[number];
export type SmartTemplateStyle = (typeof SMART_TEMPLATE_STYLES)[number];
export type SmartTemplateLayout = (typeof SMART_TEMPLATE_LAYOUTS)[number];
export type SmartTemplateFamilyId = 'modern-edge' | 'bold-impact' | 'premium-frame' | 'minimal-clear' | 'industrial-grid' | 'classic-trust' | 'luxury-signature' | 'playful-pop';

export type SmartTemplateFamily = {
  id: SmartTemplateFamilyId;
  name: string;
  style: SmartTemplateStyle;
  description: string;
  layout: SmartTemplateLayout;
  headlineFont: string;
  bodyFont: string;
};

export type SmartTemplate = {
  id: string;
  name: string;
  category: SmartTemplateCategory;
  style: SmartTemplateStyle;
  family: SmartTemplateFamilyId;
  description: string;
  headline: string;
  subheadline: string;
  callout: string;
  primary: string;
  accent: string;
  background: string;
  suggestedSizes: string[];
  tags: string[];
};

type TemplateCatalog = {
  schemaVersion: 1;
  families: SmartTemplateFamily[];
  templates: SmartTemplate[];
};

const FAMILY_IDS: SmartTemplateFamilyId[] = ['modern-edge', 'bold-impact', 'premium-frame', 'minimal-clear', 'industrial-grid', 'classic-trust', 'luxury-signature', 'playful-pop'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const requireString = (record: Record<string, unknown>, key: string, context: string) => {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${context}.${key} must be a non-empty string.`);
  return value.trim();
};
const requireStringArray = (record: Record<string, unknown>, key: string, context: string) => {
  const value = record[key];
  if (!Array.isArray(value) || !value.length || value.some((entry) => typeof entry !== 'string' || !entry.trim())) throw new Error(`${context}.${key} must contain at least one string.`);
  return value.map((entry) => String(entry).trim());
};
const requireEnum = <T extends string>(record: Record<string, unknown>, key: string, values: readonly T[], context: string) => {
  const value = requireString(record, key, context);
  if (!values.includes(value as T)) throw new Error(`${context}.${key} has unsupported value "${value}".`);
  return value as T;
};
const requireColor = (record: Record<string, unknown>, key: string, context: string) => {
  const value = requireString(record, key, context);
  if (!HEX_COLOR.test(value)) throw new Error(`${context}.${key} must be a six-digit hex color.`);
  return value;
};

const parseTemplateCatalog = (source: unknown): TemplateCatalog => {
  if (!isRecord(source) || source.schemaVersion !== 1) throw new Error('Hue template catalog must use schemaVersion 1.');
  if (!Array.isArray(source.families) || !Array.isArray(source.templates)) throw new Error('Hue template catalog requires families and templates arrays.');

  const familyIds = new Set<string>();
  const families = source.families.map((entry, index): SmartTemplateFamily => {
    const context = `families[${index}]`;
    if (!isRecord(entry)) throw new Error(`${context} must be an object.`);
    const id = requireEnum(entry, 'id', FAMILY_IDS, context);
    if (familyIds.has(id)) throw new Error(`Duplicate template family id "${id}".`);
    familyIds.add(id);
    return {
      id,
      name: requireString(entry, 'name', context),
      style: requireEnum(entry, 'style', SMART_TEMPLATE_STYLES, context),
      description: requireString(entry, 'description', context),
      layout: requireEnum(entry, 'layout', SMART_TEMPLATE_LAYOUTS, context),
      headlineFont: requireString(entry, 'headlineFont', context),
      bodyFont: requireString(entry, 'bodyFont', context)
    };
  });

  FAMILY_IDS.forEach((id) => {
    if (!familyIds.has(id)) throw new Error(`Hue template catalog is missing family "${id}".`);
  });

  const templateIds = new Set<string>();
  const templates = source.templates.map((entry, index): SmartTemplate => {
    const context = `templates[${index}]`;
    if (!isRecord(entry)) throw new Error(`${context} must be an object.`);
    const id = requireString(entry, 'id', context);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`${context}.id must be lowercase kebab-case.`);
    if (templateIds.has(id)) throw new Error(`Duplicate template id "${id}".`);
    templateIds.add(id);
    const family = requireEnum(entry, 'family', FAMILY_IDS, context);
    const style = requireEnum(entry, 'style', SMART_TEMPLATE_STYLES, context);
    const matchingFamily = families.find((candidate) => candidate.id === family);
    if (!matchingFamily || matchingFamily.style !== style) throw new Error(`${context} style must match its design family.`);
    return {
      id,
      name: requireString(entry, 'name', context),
      category: requireEnum(entry, 'category', SMART_TEMPLATE_CATEGORIES, context),
      style,
      family,
      description: requireString(entry, 'description', context),
      headline: requireString(entry, 'headline', context),
      subheadline: requireString(entry, 'subheadline', context),
      callout: requireString(entry, 'callout', context),
      primary: requireColor(entry, 'primary', context),
      accent: requireColor(entry, 'accent', context),
      background: requireColor(entry, 'background', context),
      suggestedSizes: requireStringArray(entry, 'suggestedSizes', context),
      tags: Array.isArray(entry.tags) ? entry.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).map((tag) => tag.trim()) : []
    };
  });

  if (!templates.length) throw new Error('Hue template catalog must include at least one template.');
  return { schemaVersion: 1, families, templates };
};

export const HUE_TEMPLATE_CATALOG = parseTemplateCatalog(rawTemplateCatalog);
export const SMART_TEMPLATE_FAMILIES = HUE_TEMPLATE_CATALOG.families;
export const SMART_TEMPLATES = HUE_TEMPLATE_CATALOG.templates;
export const SMART_TEMPLATE_FAMILY_BY_ID = Object.fromEntries(SMART_TEMPLATE_FAMILIES.map((family) => [family.id, family])) as Record<SmartTemplateFamilyId, SmartTemplateFamily>;
export const SMART_TEMPLATE_FAMILY_FILTERS: Array<'All' | SmartTemplateFamilyId> = ['All', ...SMART_TEMPLATE_FAMILIES.map((family) => family.id)];
export const SMART_TEMPLATE_CATEGORY_FILTERS: Array<'All' | SmartTemplateCategory> = ['All', ...SMART_TEMPLATE_CATEGORIES];
export const SMART_TEMPLATE_STYLE_FILTERS: Array<'All' | SmartTemplateStyle> = ['All', ...SMART_TEMPLATE_STYLES];
export const getSmartTemplateFamily = (template: SmartTemplate) => SMART_TEMPLATE_FAMILY_BY_ID[template.family];
export const getSmartTemplateThumbnailUrl = (template: SmartTemplate) => `/template-thumbnails/${template.id}.svg`;
