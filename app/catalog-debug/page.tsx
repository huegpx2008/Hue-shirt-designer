import { readFile } from 'node:fs/promises';
import path from 'node:path';

type CatalogPreviewItem = {
  styleNumber: string;
  productName: string;
  brand: string;
  category?: string;
  color: string;
  firstImageUrl: string;
};

type CatalogPreviewPayload = {
  sourceColumns: string[];
  fieldMapping: Record<string, string>;
  rows: CatalogPreviewItem[];
};

async function getPreviewData(): Promise<CatalogPreviewPayload> {
  const filePath = path.join(process.cwd(), 'public/data/catalog-preview-25.json');
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as CatalogPreviewPayload;
}

export default async function CatalogDebugPage() {
  const payload = await getPreviewData();
  const items = payload.rows;

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-6">
      <h1 className="mb-2 text-2xl font-semibold">Catalog Debug Preview</h1>
      <p className="mb-6 text-sm text-slate-600">Showing first {items.length} usable rows parsed from SanMar_SDL_N_main_downsize.xlsx.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2">Style #</th>
              <th className="px-3 py-2">Product Name</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Color</th>
              <th className="px-3 py-2">First Image URL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.styleNumber}-${item.color}`} className="border-t">
                <td className="px-3 py-2">{item.styleNumber}</td>
                <td className="px-3 py-2">{item.productName}</td>
                <td className="px-3 py-2">{item.brand}</td>
                <td className="px-3 py-2">{item.color}</td>
                <td className="px-3 py-2">
                  <a className="text-blue-600 underline" href={item.firstImageUrl} target="_blank" rel="noreferrer">
                    {item.firstImageUrl}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
