export type ProductionPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ProductionArtworkRecipe = {
  version: 1;
  id: string;
  role: string;
  customerFileName: string;
  sourceStoragePath: string;
  sourceAssetId?: string;
  productionReference?: string;
  sourceMimeType?: string;
  sourcePixelWidth?: number;
  sourcePixelHeight?: number;
  sourceDpi?: number;
  artboardWidthInches: number;
  artboardHeightInches: number;
  fitMode: 'stretch' | 'center' | 'full-bleed' | 'contain';
  placement: ProductionPlacement;
  proofStoragePath: string;
  proofFileName: string;
  createdAt: string;
};

export const isProductionArtworkRecipe = (value: unknown): value is ProductionArtworkRecipe => {
  if (!value || typeof value !== 'object') return false;
  const recipe = value as Partial<ProductionArtworkRecipe>;
  const placement = recipe.placement as Partial<ProductionPlacement> | undefined;
  return recipe.version === 1
    && typeof recipe.id === 'string'
    && typeof recipe.role === 'string'
    && typeof recipe.customerFileName === 'string'
    && typeof recipe.sourceStoragePath === 'string'
    && Number.isFinite(recipe.artboardWidthInches)
    && Number(recipe.artboardWidthInches) > 0
    && Number.isFinite(recipe.artboardHeightInches)
    && Number(recipe.artboardHeightInches) > 0
    && Boolean(placement)
    && Number.isFinite(placement?.x)
    && Number.isFinite(placement?.y)
    && Number.isFinite(placement?.width)
    && Number(placement?.width) > 0
    && Number.isFinite(placement?.height)
    && Number(placement?.height) > 0
    && typeof recipe.proofStoragePath === 'string';
};
