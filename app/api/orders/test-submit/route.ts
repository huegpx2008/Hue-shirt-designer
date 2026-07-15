import { NextResponse } from "next/server";
import { calculatePromoDiscount, getPromoCode, getStorageSignedUrl, hasSupabaseAdminConfig, moveStorageObject, supabaseAdminFetch } from "@/lib/server/supabase-admin";

type OrderArtworkFile = {
  role?: string;
  name?: string;
  storagePath?: string;
  storageUrl?: string;
  source?: string;
};

type OrderProductionArtwork = {
  id?: string;
  label?: string;
  quantity?: number;
  sizeLabel?: string;
  sheetLabel?: string;
  frontName?: string;
  frontPreviewUrl?: string;
  frontStoragePath?: string;
  backName?: string;
  backPreviewUrl?: string;
  backStoragePath?: string;
};

type OrderItem = {
  id?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  sizeLabel?: string;
  optionSummary?: string[];
  productionSummary?: string[];
  price?: { total?: number | null; each?: number | null; currency?: string };
  artworkFiles?: OrderArtworkFile[];
  productionBreakdown?: OrderProductionArtwork[];
};

type TestOrderEmailPayload = {
  order?: {
    orderNumber?: string;
    createdAt?: string;
    currency?: string;
    customer?: {
      name?: string;
      organization?: string;
      email?: string;
      phone?: string;
      notes?: string;
      taxExempt?: boolean;
      checkoutMode?: string;
      userId?: string;
    };
    fulfillment?: {
      method?: "pickup" | "direct_ship";
      address?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string };
    };
    items?: OrderItem[];
    subtotal?: number;
    promotion?: { code?: string; description?: string; discountAmount?: number };
    shipping?: { amount?: number; label?: string };
    tax?: { rate?: number; amount?: number; label?: string };
    total?: number;
  };
};

const formatMoney = (value: unknown, currency = "USD") => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(numberValue);
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const renderField = (label: string, value: unknown) => `
  <tr>
    <td style="padding:9px 0;color:#6b7280;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:9px 0;color:#111827;font-size:14px;vertical-align:top;">${escapeHtml(value || "Not provided")}</td>
  </tr>
`;

const renderList = (items: string[] | undefined) => {
  if (!items?.length) return "<p style=\"margin:0;color:#6b7280;font-size:13px;\">None listed</p>";
  return `<ul style="margin:8px 0 0;padding-left:18px;color:#374151;font-size:13px;line-height:1.55;">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
};

const renderArtworkFiles = (files: OrderArtworkFile[] | undefined) => {
  if (!files?.length) return "<p style=\"margin:8px 0 0;color:#b45309;font-size:13px;\">No artwork files attached.</p>";
  return `<div style="margin-top:10px;">${files.map((file) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin-top:8px;background:#f9fafb;">
      <p style="margin:0;color:#111827;font-size:13px;font-weight:800;">${escapeHtml(file.role || "Artwork")}: ${escapeHtml(file.name || "Unnamed file")}</p>
      <p style="margin:5px 0 0;color:#4b5563;font-size:12px;word-break:break-all;">Path: ${escapeHtml(file.storagePath || "Browser/local preview only")}</p>
      ${file.storageUrl ? `<p style="margin:7px 0 0;font-size:12px;"><a href="${escapeHtml(file.storageUrl)}" style="color:#0369a1;font-weight:700;">Open production file</a></p>` : ""}
    </div>
  `).join("")}</div>`;
};

const renderArtworkPreview = (url: string | undefined, side: string) => url
  ? `<div style="display:inline-block;width:132px;margin:0 10px 8px 0;vertical-align:top;text-align:center;">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(side)} artwork" style="display:block;width:130px;height:105px;object-fit:contain;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;" />
      <p style="margin:5px 0 0;color:#64748b;font-size:10px;font-weight:900;letter-spacing:.12em;">${escapeHtml(side.toUpperCase())}</p>
    </div>`
  : `<div style="display:inline-block;width:132px;height:105px;margin:0 10px 8px 0;border:1px dashed #94a3b8;border-radius:8px;background:#f8fafc;color:#64748b;font-size:11px;line-height:105px;text-align:center;vertical-align:top;">No preview</div>`;

const renderProductionBreakdown = (artwork: OrderProductionArtwork[] | undefined) => {
  if (!artwork?.length) return "<p style=\"margin:8px 0 0;color:#b45309;font-size:13px;\">No per-artwork quantity breakdown was recorded.</p>";
  return `<div style="margin-top:10px;">${artwork.map((entry, index) => `
    <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;border:2px solid #38bdf8;border-radius:12px;background:#f0f9ff;overflow:hidden;">
      <tr>
        <td style="width:290px;padding:14px;vertical-align:top;">
          ${renderArtworkPreview(entry.frontPreviewUrl, "Front")}
          ${entry.backName || entry.backPreviewUrl ? renderArtworkPreview(entry.backPreviewUrl, "Back") : ""}
        </td>
        <td style="padding:14px;vertical-align:top;">
          <p style="margin:0;color:#075985;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;">${escapeHtml(entry.label || `Artwork set ${index + 1}`)}</p>
          <p style="margin:6px 0;color:#111827;font-size:26px;font-weight:900;line-height:1;">Quantity: ${escapeHtml(Math.max(0, Number(entry.quantity || 0)))}</p>
          <p style="margin:9px 0 0;color:#334155;font-size:13px;"><strong>Finished size:</strong> ${escapeHtml(entry.sizeLabel || "Not listed")}</p>
          ${entry.sheetLabel ? `<p style="margin:5px 0 0;color:#334155;font-size:13px;"><strong>Production placement:</strong> ${escapeHtml(entry.sheetLabel)}</p>` : ""}
          <p style="margin:5px 0 0;color:#334155;font-size:12px;word-break:break-word;"><strong>Front:</strong> ${escapeHtml(entry.frontName || "Unnamed artwork")}</p>
          ${entry.backName ? `<p style="margin:5px 0 0;color:#334155;font-size:12px;word-break:break-word;"><strong>Back:</strong> ${escapeHtml(entry.backName)}</p>` : ""}
        </td>
      </tr>
    </table>
  `).join("")}</div>`;
};

const getSafeOrderToken = (value: unknown, fallback: string, maxLength = 36) => {
  const token = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (token || fallback).slice(0, maxLength);
};

const getStorageExtension = (path: string | undefined) => {
  const match = String(path || '').match(/\.([a-zA-Z0-9]{2,5})$/);
  return match ? match[1].toLowerCase() : 'png';
};

const organizeOrderProductionFiles = async (order: NonNullable<TestOrderEmailPayload['order']>) => {
  const warnings: string[] = [];
  const orderToken = getSafeOrderToken(order.orderNumber, 'ORDER');
  for (const [itemIndex, item] of (order.items || []).entries()) {
    const itemToken = `I${String(itemIndex + 1).padStart(2, '0')}`;
    const productToken = getSafeOrderToken(item.productId || item.productName, 'PRINT', 18);
    for (const [artworkIndex, artwork] of (item.productionBreakdown || []).entries()) {
      const artworkToken = `A${String(artworkIndex + 1).padStart(2, '0')}`;
      const quantityToken = `QTY-${String(Math.max(0, Number(artwork.quantity || 0))).padStart(3, '0')}`;
      const sizeToken = getSafeOrderToken(String(artwork.sizeLabel || item.sizeLabel || 'CUSTOM').replace(/["']/g, '').replace(/\s*x\s*/i, 'x'), 'CUSTOM', 18);

      const organizeSide = async (side: 'FRONT' | 'BACK') => {
        const sourcePath = side === 'FRONT' ? artwork.frontStoragePath : artwork.backStoragePath;
        if (!sourcePath || sourcePath.startsWith(`orders/${orderToken}/`)) return;
        const extension = getStorageExtension(sourcePath);
        const fileName = `${orderToken}_${itemToken}_${productToken}_${artworkToken}_${quantityToken}_${sizeToken}_${side}.${extension}`;
        const destinationPath = `orders/${orderToken}/ITEM-${String(itemIndex + 1).padStart(2, '0')}/${fileName}`;
        const matchingFiles = (item.artworkFiles || []).filter((file) => file.storagePath === sourcePath);
        try {
          await moveStorageObject(sourcePath, destinationPath);
          const storageUrl = await getStorageSignedUrl(destinationPath, 60 * 60 * 24 * 7).catch(() => undefined);
          if (side === 'FRONT') {
            artwork.frontName = fileName;
            artwork.frontStoragePath = destinationPath;
            artwork.frontPreviewUrl = storageUrl || artwork.frontPreviewUrl;
          } else {
            artwork.backName = fileName;
            artwork.backStoragePath = destinationPath;
            artwork.backPreviewUrl = storageUrl || artwork.backPreviewUrl;
          }
          for (const file of matchingFiles) {
            file.name = fileName;
            file.storagePath = destinationPath;
            file.storageUrl = storageUrl || file.storageUrl;
          }
        } catch (error) {
          const details = error instanceof Error ? error.message : 'Unknown storage error';
          warnings.push(`${artwork.label || artworkToken} ${side.toLowerCase()} could not be moved into the order folder: ${details}`);
        }
      };

      await organizeSide('FRONT');
      if (artwork.backStoragePath) await organizeSide('BACK');
    }
  }
  return warnings;
};

export async function POST(request: Request) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const orderToEmail = process.env.QUOTE_TO_EMAIL || "jason@huegraphics.cc";
  const orderFromEmail = process.env.QUOTE_FROM_EMAIL || "Hue Graphics Orders <orders@huegraphics.cc>";

  let payload: TestOrderEmailPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid order payload." }, { status: 400 });
  }

  const order = payload.order;
  if (!order?.orderNumber || !order.customer?.email || !order.items?.length) {
    return NextResponse.json({ error: "Order number, customer email, and at least one item are required." }, { status: 400 });
  }

  let validatedPromo: Awaited<ReturnType<typeof getPromoCode>> = null;
  if (order.promotion?.code) {
    try {
      const promo = await getPromoCode(order.promotion.code);
      if (!promo) return NextResponse.json({ error: "The promo code is no longer valid." }, { status: 400 });
      validatedPromo = promo;
      const subtotal = Number(order.subtotal || 0);
      const discountAmount = calculatePromoDiscount(promo, subtotal);
      order.promotion = { code: promo.code, description: promo.description || '', discountAmount };
      const shipping = Number(order.shipping?.amount || 0);
      const taxRate = Number(order.tax?.rate || 0);
      const taxableAmount = Math.max(0, subtotal - discountAmount) + shipping;
      if (order.tax) order.tax.amount = Number((taxableAmount * taxRate).toFixed(2));
      order.total = Number((taxableAmount + Number(order.tax?.amount || 0)).toFixed(2));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "The promo code could not be validated." }, { status: 400 });
    }
  }

  let persistenceWarning = '';
  if (hasSupabaseAdminConfig()) {
    try {
      const organizationWarnings = await organizeOrderProductionFiles(order);
      if (organizationWarnings.length) persistenceWarning = organizationWarnings.join(' ');
      await supabaseAdminFetch('/rest/v1/hue_orders?on_conflict=order_number', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          order_number: order.orderNumber,
          status: 'test_submitted',
          customer_user_id: order.customer.userId || null,
          customer_email: order.customer.email,
          customer_name: order.customer.name || null,
          subtotal: Number(order.subtotal || 0),
          discount: Number(order.promotion?.discountAmount || 0),
          promo_code: order.promotion?.code || null,
          shipping: Number(order.shipping?.amount || 0),
          tax: Number(order.tax?.amount || 0),
          total: Number(order.total || 0),
          currency: order.currency || 'USD',
          order_data: order,
          created_at: order.createdAt || new Date().toISOString()
        })
      });
      if (validatedPromo?.id) {
        await supabaseAdminFetch(`/rest/v1/hue_promo_codes?id=eq.${encodeURIComponent(validatedPromo.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ uses_count: Number(validatedPromo.uses_count || 0) + 1, updated_at: new Date().toISOString() })
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The order could not be added to the admin dashboard.';
      persistenceWarning = [persistenceWarning, message].filter(Boolean).join(' ');
    }
  } else {
    persistenceWarning = 'SUPABASE_SERVICE_ROLE_KEY is not configured, so this order is not visible in the admin dashboard yet.';
  }

  if (!resendApiKey) {
    return NextResponse.json(
      { error: `Order saved, but email is not configured. Add RESEND_API_KEY.${persistenceWarning ? ` ${persistenceWarning}` : ''}`, order },
      { status: 500 },
    );
  }

  const currency = order.currency || "USD";
  const fulfillmentLabel = order.fulfillment?.method === "direct_ship" ? "Direct ship" : "Local pickup";
  const shippingAddress = order.fulfillment?.address
    ? [order.fulfillment.address.line1, order.fulfillment.address.line2, `${order.fulfillment.address.city || ""}, ${order.fulfillment.address.state || ""} ${order.fulfillment.address.postalCode || ""}`.trim()].filter(Boolean).join("\n")
    : "";

  const itemBlocks = order.items.map((item, index) => `
    <div style="border:1px solid #dbeafe;border-radius:14px;margin-top:16px;overflow:hidden;">
      <div style="background:#eff6ff;padding:14px 16px;">
        <p style="margin:0;color:#075985;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;">Item ${index + 1}</p>
        <h2 style="margin:5px 0 0;color:#111827;font-size:20px;">${escapeHtml(item.productName || "Print-ready item")}</h2>
        <p style="margin:6px 0 0;color:#374151;font-size:14px;">${escapeHtml(item.sizeLabel || "Size not listed")} / Qty ${escapeHtml(item.quantity || 0)} / ${formatMoney(item.price?.total, item.price?.currency || currency)}</p>
      </div>
      <div style="padding:16px;">
        <p style="margin:0;color:#111827;font-size:15px;font-weight:900;">Production Artwork Breakdown</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:12px;">The quantities below are the exact number to produce for each design.</p>
        ${renderProductionBreakdown(item.productionBreakdown)}
        <p style="margin:16px 0 0;color:#111827;font-size:13px;font-weight:800;">Options</p>
        ${renderList(item.optionSummary)}
        <p style="margin:16px 0 0;color:#111827;font-size:13px;font-weight:800;">Production Notes</p>
        ${renderList(item.productionSummary)}
        <p style="margin:16px 0 0;color:#111827;font-size:13px;font-weight:800;">Artwork References</p>
        ${renderArtworkFiles(item.artworkFiles)}
      </div>
    </div>
  `).join("");

  const html = `
    <div style="background:#f5f7fb;padding:24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="background:#07111f;padding:24px;">
          <p style="margin:0;color:#62d4ff;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.18em;">Hue Studio Order</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:30px;line-height:1.1;">${escapeHtml(order.orderNumber)}</h1>
          <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;">Test checkout submitted ${escapeHtml(order.createdAt ? new Date(order.createdAt).toLocaleString() : "today")}.</p>
        </div>
        <div style="padding:24px;">
          <table style="width:100%;border-collapse:collapse;">
            ${renderField("Customer", order.customer.name)}
            ${renderField("Organization", order.customer.organization)}
            ${renderField("Email", order.customer.email)}
            ${renderField("Phone", order.customer.phone)}
            ${renderField("Fulfillment", fulfillmentLabel)}
            ${shippingAddress ? renderField("Ship To", shippingAddress) : ""}
            ${renderField("Tax exempt", order.customer.taxExempt ? "Yes - verify exemption form" : "No")}
            ${renderField("Notes", order.customer.notes)}
          </table>
          <div style="margin-top:18px;border:1px solid #e5e7eb;border-radius:14px;padding:16px;background:#f9fafb;">
            <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:900;">Order Totals</p>
            <table style="width:100%;border-collapse:collapse;">
              ${renderField("Subtotal", formatMoney(order.subtotal, currency))}
              ${order.promotion?.code ? renderField(`Promo ${order.promotion.code}`, `-${formatMoney(order.promotion.discountAmount || 0, currency)}`) : ""}
              ${renderField(order.shipping?.label || "Shipping", formatMoney(order.shipping?.amount || 0, currency))}
              ${renderField(order.tax?.label || "Tax", formatMoney(order.tax?.amount || 0, currency))}
              ${renderField("Total", formatMoney(order.total, currency))}
            </table>
          </div>
          ${itemBlocks}
        </div>
      </div>
    </div>
  `;

  const text = [
    `Hue Studio Order ${order.orderNumber}`,
    `Customer: ${order.customer.name || "Not provided"}`,
    `Email: ${order.customer.email}`,
    `Fulfillment: ${fulfillmentLabel}`,
    shippingAddress ? `Ship To:\n${shippingAddress}` : "",
    `Subtotal: ${formatMoney(order.subtotal, currency)}`,
    order.promotion?.code ? `Promo ${order.promotion.code}: -${formatMoney(order.promotion.discountAmount || 0, currency)}` : "",
    `${order.shipping?.label || "Shipping"}: ${formatMoney(order.shipping?.amount || 0, currency)}`,
    `${order.tax?.label || "Tax"}: ${formatMoney(order.tax?.amount || 0, currency)}`,
    `Total: ${formatMoney(order.total, currency)}`,
    "",
    "Items:",
    ...order.items.flatMap((item, index) => [
      `${index + 1}. ${item.productName || "Print-ready item"} / ${item.sizeLabel || "Size not listed"} / Qty ${item.quantity || 0}`,
      "   Production artwork breakdown:",
      ...(item.productionBreakdown || []).flatMap((entry, artworkIndex) => [
        `   - ${entry.label || `Artwork set ${artworkIndex + 1}`}: Qty ${entry.quantity || 0} / ${entry.sizeLabel || item.sizeLabel || "Size not listed"}${entry.sheetLabel ? ` / ${entry.sheetLabel}` : ""}`,
        `     Front: ${entry.frontName || "Unnamed artwork"}${entry.frontStoragePath ? ` / ${entry.frontStoragePath}` : ""}`,
        entry.backName ? `     Back: ${entry.backName}${entry.backStoragePath ? ` / ${entry.backStoragePath}` : ""}` : "",
      ]),
      ...(item.artworkFiles || []).map((file) => `   ${file.role || "Artwork"}: ${file.name || "Unnamed file"} / ${file.storagePath || "Browser/local preview only"}`),
    ]),
  ].filter(Boolean).join("\n");

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: orderFromEmail,
      html,
      reply_to: order.customer.email,
      subject: `Hue Studio Test Order ${order.orderNumber}`,
      text,
      to: orderToEmail,
    }),
  });

  if (!resendResponse.ok) {
    return NextResponse.json(
      { error: "The order was saved, but the email could not be sent. Check the Resend sender and API key.", order },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, persistenceWarning: persistenceWarning || undefined, order });
}
