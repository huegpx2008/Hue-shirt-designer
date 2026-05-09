export const SHIRT_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#111111' },
  { name: 'Gray', value: '#8b8b8b' },
  { name: 'Navy', value: '#1f365f' },
  { name: 'Red', value: '#b91c1c' }
] as const;

export type ShirtColorValue = (typeof SHIRT_COLORS)[number]['value'];
