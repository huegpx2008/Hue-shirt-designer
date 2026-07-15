import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { getStorageBucket, hasSupabaseAdminConfig, supabaseAdminFetch } from '@/lib/server/supabase-admin';

type StorageEntry = { id?: string | null; name?: string; created_at?: string; updated_at?: string; metadata?: { size?: number; mimetype?: string }; path?: string };

const listStorageFiles = async (prefix = '', depth = 0): Promise<StorageEntry[]> => {
  const entries = await supabaseAdminFetch(`/storage/v1/object/list/${encodeURIComponent(getStorageBucket())}`, { method: 'POST', body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }) }) as StorageEntry[];
  const files = entries.filter((entry) => entry.id).map((entry) => ({ ...entry, path: prefix ? `${prefix}/${entry.name}` : entry.name }));
  if (depth >= 4) return files;
  const folders = entries.filter((entry) => !entry.id && entry.name);
  const nested = await Promise.all(folders.map((folder) => listStorageFiles(prefix ? `${prefix}/${folder.name}` : String(folder.name), depth + 1)));
  return [...files, ...nested.flat()];
};

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Add SUPABASE_SERVICE_ROLE_KEY to load admin data.' }, { status: 503 });
  try {
    const results = await Promise.allSettled([
      supabaseAdminFetch('/auth/v1/admin/users?page=1&per_page=200') as Promise<{ users?: unknown[] }>,
      supabaseAdminFetch('/rest/v1/hue_orders?select=*&order=created_at.desc&limit=250') as Promise<unknown[]>,
      listStorageFiles(),
      supabaseAdminFetch('/rest/v1/hue_promo_codes?select=*&order=created_at.desc') as Promise<unknown[]>
    ]);
    const sectionNames = ['users', 'orders', 'files', 'promos'] as const;
    const sectionErrors = results.reduce<Record<string, string>>((errors, result, index) => {
      if (result.status === 'rejected') {
        errors[sectionNames[index]] = result.reason instanceof Error ? result.reason.message : 'This section could not be loaded.';
      }
      return errors;
    }, {});
    const usersPayload = results[0].status === 'fulfilled' ? results[0].value : { users: [] };
    const orders = results[1].status === 'fulfilled' ? results[1].value : [];
    const files = results[2].status === 'fulfilled' ? results[2].value : [];
    const promos = results[3].status === 'fulfilled' ? results[3].value : [];
    return NextResponse.json({ users: usersPayload.users || [], orders, files, promos, sectionErrors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin data could not be loaded.' }, { status: 500 });
  }
}
