const retentionDays = (name: string, fallback: number, minimum: number, maximum = 3650) => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const configured = Number(raw);
  if (!Number.isFinite(configured)) return fallback;
  return Math.min(Math.max(Math.round(configured), minimum), maximum);
};

// B2 is the active production-original store. Supabase retains the customer-facing
// preview and metadata; Google Drive becomes the verified long-term archive.
export const ORDER_DRIVE_ARCHIVE_DELAY_DAYS = retentionDays('HUE_ORDER_DRIVE_ARCHIVE_DELAY_DAYS', 0, 0);
export const CUSTOMER_LIBRARY_DRIVE_ARCHIVE_DELAY_DAYS = retentionDays('HUE_LIBRARY_DRIVE_ARCHIVE_DELAY_DAYS', 90, 7);
export const SUPABASE_ORIGINAL_RETENTION_DAYS = retentionDays('HUE_SUPABASE_ORIGINAL_RETENTION_DAYS', 365, 30);
export const GUEST_UPLOAD_RETENTION_HOURS = retentionDays('HUE_GUEST_UPLOAD_RETENTION_DAYS', 7, 1, 90) * 24;
export const B2_ORDER_SAFETY_RETENTION_DAYS = retentionDays('HUE_B2_ORDER_SAFETY_RETENTION_DAYS', 14, 1, 365);
