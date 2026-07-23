import 'server-only';

type ArtworkStorageMetadata = Record<string, unknown> | null | undefined;

const cleanDisplayName = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const basename = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim();
  return basename?.slice(0, 255) || '';
};

export const getArtworkDisplayName = (storageName: string, metadata?: ArtworkStorageMetadata) => {
  const nestedMetadata = metadata?.metadata && typeof metadata.metadata === 'object'
    ? metadata.metadata as Record<string, unknown>
    : undefined;
  const savedOriginalName = cleanDisplayName(
    metadata?.originalName
      || metadata?.original_name
      || nestedMetadata?.originalName
      || nestedMetadata?.original_name,
  );
  if (savedOriginalName) return savedOriginalName;

  // Older uploads predate original-name metadata. Their exact punctuation and
  // spacing cannot be recovered, but the storage timestamp/UUID can be hidden.
  const legacyName = storageName.match(/^\d{10,}-[0-9a-f]{8}-(.+)$/i)?.[1] || storageName;
  return cleanDisplayName(legacyName) || 'artwork';
};
