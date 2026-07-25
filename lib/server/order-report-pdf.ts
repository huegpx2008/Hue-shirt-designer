import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getOrderWorkflowLabel, normalizeOrderWorkflowStatus, type OrderWorkflow } from '../order-workflow';

export type OrderReportRow = {
  id?: string;
  order_number?: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
  customer_email?: string;
  customer_name?: string;
  subtotal?: number | string | null;
  discount?: number | string | null;
  promo_code?: string | null;
  shipping?: number | string | null;
  tax?: number | string | null;
  total?: number | string | null;
  currency?: string;
  payment_provider?: string | null;
  payment_status?: string | null;
  paypal_order_id?: string | null;
  paypal_capture_id?: string | null;
  paid_at?: string | null;
  printavo_status?: string;
  printavo_order_number?: string | null;
  printavo_added_at?: string | null;
  drive_archive_status?: string | null;
  drive_folder_url?: string | null;
  drive_archived_at?: string | null;
  order_data?: Record<string, unknown> | null;
};

type PdfContext = {
  document: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
  pageNumber: number;
  reportTitle: string;
  pageNumberTargets: PDFPage[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TOP_Y = PAGE_HEIGHT - 72;
const BOTTOM_Y = 48;
const navy = rgb(0.027, 0.067, 0.122);
const blue = rgb(0.086, 0.525, 0.788);
const slate = rgb(0.25, 0.31, 0.39);
const paleBlue = rgb(0.93, 0.97, 1);
const paleGray = rgb(0.96, 0.97, 0.98);
const green = rgb(0.05, 0.55, 0.35);

const pdfText = (value: unknown) => String(value ?? '')
  .replace(/[\u2010-\u2015]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/\u2022/g, '-')
  .normalize('NFKD')
  .replace(/[^\x20-\x7E\n]/g, '')
  .replace(/[ \t]+/g, ' ')
  .trim();

const money = (value: unknown, currency = 'USD') => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  }
};

const dateTime = (value: unknown) => {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(parsed);
};

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const paragraphs = pdfText(text).split('\n');
  const lines: string[] = [];
  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push('');
      return;
    }
    const words = paragraph.split(' ');
    let current = '';
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        return;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        return;
      }
      let piece = '';
      for (const char of word) {
        if (font.widthOfTextAtSize(piece + char, size) > maxWidth && piece) {
          lines.push(piece);
          piece = char;
        } else piece += char;
      }
      current = piece;
    });
    if (current) lines.push(current);
  });
  return lines.length ? lines : [''];
};

const addPage = (context: PdfContext) => {
  context.page = context.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  context.pageNumber += 1;
  context.pageNumberTargets.push(context.page);
  context.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 52, width: PAGE_WIDTH, height: 52, color: navy });
  context.page.drawText('HUE STUDIO', { x: MARGIN, y: PAGE_HEIGHT - 31, size: 13, font: context.bold, color: rgb(1, 1, 1) });
  context.page.drawText(pdfText(context.reportTitle), { x: MARGIN + 102, y: PAGE_HEIGHT - 30, size: 9, font: context.regular, color: rgb(0.75, 0.88, 0.96) });
  context.y = TOP_Y;
};

const ensureSpace = (context: PdfContext, height: number) => {
  if (context.y - height < BOTTOM_Y) addPage(context);
};

const drawParagraph = (context: PdfContext, text: unknown, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number } = {}) => {
  const font = options.font || context.regular;
  const size = options.size || 9;
  const indent = options.indent || 0;
  const lineHeight = size * 1.38;
  const lines = wrapText(pdfText(text), font, size, CONTENT_WIDTH - indent);
  lines.forEach((line) => {
    ensureSpace(context, lineHeight);
    context.page.drawText(line || ' ', { x: MARGIN + indent, y: context.y, size, font, color: options.color || slate });
    context.y -= lineHeight;
  });
  context.y -= options.gapAfter ?? 3;
};

const drawSectionTitle = (context: PdfContext, title: string) => {
  ensureSpace(context, 38);
  context.y -= 6;
  context.page.drawRectangle({ x: MARGIN, y: context.y - 20, width: CONTENT_WIDTH, height: 24, color: paleBlue, borderColor: rgb(0.75, 0.88, 0.97), borderWidth: 0.7 });
  context.page.drawText(pdfText(title).toUpperCase(), { x: MARGIN + 9, y: context.y - 12, size: 9, font: context.bold, color: rgb(0.03, 0.35, 0.55) });
  context.y -= 34;
};

const drawKeyValue = (context: PdfContext, label: string, value: unknown) => {
  const cleanValue = pdfText(value) || 'Not recorded';
  const labelWidth = 112;
  const valueLines = wrapText(cleanValue, context.regular, 8.5, CONTENT_WIDTH - labelWidth - 8);
  ensureSpace(context, Math.max(14, valueLines.length * 12));
  context.page.drawText(pdfText(label), { x: MARGIN, y: context.y, size: 8.5, font: context.bold, color: slate });
  valueLines.forEach((line, index) => context.page.drawText(line || ' ', { x: MARGIN + labelWidth, y: context.y - index * 12, size: 8.5, font: context.regular, color: slate }));
  context.y -= Math.max(14, valueLines.length * 12);
};

const objectValue = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const arrayValue = (value: unknown) => Array.isArray(value) ? value : [];

const drawOrder = (context: PdfContext, order: OrderReportRow, index: number) => {
  ensureSpace(context, 86);
  context.page.drawRectangle({ x: MARGIN, y: context.y - 30, width: CONTENT_WIDTH, height: 42, color: navy });
  context.page.drawText(`${index + 1}. ${pdfText(order.order_number || 'Order')}`, { x: MARGIN + 12, y: context.y - 4, size: 15, font: context.bold, color: rgb(1, 1, 1) });
  const status = normalizeOrderWorkflowStatus(order.status);
  context.page.drawText(pdfText(getOrderWorkflowLabel(status)), { x: MARGIN + 12, y: context.y - 20, size: 8.5, font: context.regular, color: rgb(0.58, 0.86, 1) });
  const totalLabel = money(order.total, order.currency || 'USD');
  context.page.drawText(totalLabel, { x: PAGE_WIDTH - MARGIN - context.bold.widthOfTextAtSize(totalLabel, 14) - 12, y: context.y - 7, size: 14, font: context.bold, color: rgb(0.3, 0.95, 0.67) });
  context.y -= 50;

  const orderData = objectValue(order.order_data);
  const customer = objectValue(orderData.customer);
  const fulfillment = objectValue(orderData.fulfillment);
  const address = objectValue(fulfillment.address);
  const payment = objectValue(orderData.payment);
  const workflow = objectValue(orderData.workflow) as Partial<OrderWorkflow>;

  drawSectionTitle(context, 'Customer and fulfillment');
  drawKeyValue(context, 'Customer', customer.name || order.customer_name);
  drawKeyValue(context, 'Organization', customer.organization);
  drawKeyValue(context, 'Email', customer.email || order.customer_email);
  drawKeyValue(context, 'Phone', customer.phone);
  drawKeyValue(context, 'Submitted', dateTime(order.created_at || orderData.createdAt));
  drawKeyValue(context, 'Fulfillment', fulfillment.method === 'direct_ship' ? 'Direct shipping' : 'Local pickup');
  if (fulfillment.method === 'direct_ship') drawKeyValue(context, 'Ship to', [address.line1, address.line2, [address.city, address.state, address.postalCode].filter(Boolean).join(', ')].filter(Boolean).join('\n'));
  drawKeyValue(context, 'Customer notes', customer.notes);
  drawKeyValue(context, 'Tax exempt', customer.taxExempt ? 'Yes - verify documentation' : 'No');

  drawSectionTitle(context, 'Payment and totals');
  drawKeyValue(context, 'Payment status', order.payment_status || payment.status || orderData.paymentMode);
  drawKeyValue(context, 'Payment provider', order.payment_provider || payment.provider);
  drawKeyValue(context, 'Paid', order.paid_at || payment.paidAt ? dateTime(order.paid_at || payment.paidAt) : 'Not recorded');
  drawKeyValue(context, 'PayPal order ID', order.paypal_order_id || payment.paypalOrderId);
  drawKeyValue(context, 'PayPal capture ID', order.paypal_capture_id || payment.captureId);
  drawKeyValue(context, 'Subtotal', money(order.subtotal ?? orderData.subtotal, order.currency || String(orderData.currency || 'USD')));
  drawKeyValue(context, 'Discount', money(-(Number(order.discount || 0)), order.currency || String(orderData.currency || 'USD')));
  drawKeyValue(context, 'Promotion', order.promo_code || objectValue(orderData.promotion).code);
  drawKeyValue(context, 'Shipping', money(order.shipping ?? objectValue(orderData.shipping).amount, order.currency || String(orderData.currency || 'USD')));
  drawKeyValue(context, 'Tax', money(order.tax ?? objectValue(orderData.tax).amount, order.currency || String(orderData.currency || 'USD')));
  drawKeyValue(context, 'Total', money(order.total ?? orderData.total, order.currency || String(orderData.currency || 'USD')));

  drawSectionTitle(context, 'Production workflow');
  drawKeyValue(context, 'Current status', workflow.currentLabel || getOrderWorkflowLabel(status));
  drawKeyValue(context, 'Status updated', workflow.updatedAt ? dateTime(workflow.updatedAt) : dateTime(order.updated_at));
  drawKeyValue(context, 'Tracking', [workflow.carrier, workflow.trackingNumber].filter(Boolean).join(' - '));
  drawKeyValue(context, 'Tracking URL', workflow.trackingUrl);
  drawKeyValue(context, 'Printavo', order.printavo_status === 'added' ? `Added${order.printavo_order_number ? ` - #${order.printavo_order_number}` : ''}${order.printavo_added_at ? ` on ${dateTime(order.printavo_added_at)}` : ''}` : 'Not added');
  drawKeyValue(context, 'Drive archive', `${order.drive_archive_status || 'pending'}${order.drive_archived_at ? ` - ${dateTime(order.drive_archived_at)}` : ''}`);
  drawKeyValue(context, 'Drive folder', order.drive_folder_url);
  const statusHistory = arrayValue(workflow.history) as Array<Record<string, unknown>>;
  statusHistory.forEach((event) => drawParagraph(context, `- ${dateTime(event.createdAt)}: ${event.label || getOrderWorkflowLabel(String(event.status || 'received'))}; email ${event.emailStatus || 'not recorded'}${event.trackingNumber ? `; tracking ${event.trackingNumber}` : ''}`, { size: 8.2, indent: 8 }));

  const items = arrayValue(orderData.items) as Array<Record<string, unknown>>;
  drawSectionTitle(context, `Items (${items.length})`);
  if (!items.length) drawParagraph(context, 'No structured item details were stored for this order.');
  items.forEach((item, itemIndex) => {
    ensureSpace(context, 54);
    context.page.drawRectangle({ x: MARGIN, y: context.y - 8, width: CONTENT_WIDTH, height: 24, color: paleGray });
    context.page.drawText(`Item ${itemIndex + 1}: ${pdfText(item.productName || 'Print item')}`, { x: MARGIN + 8, y: context.y, size: 10, font: context.bold, color: navy });
    context.y -= 32;
    drawKeyValue(context, 'Product ID', item.productId);
    drawKeyValue(context, 'Size / quantity', `${pdfText(item.sizeLabel || 'Size not listed')} / Qty ${Number(item.quantity || 0)}`);
    const price = objectValue(item.price);
    drawKeyValue(context, 'Item price', `${money(price.total, String(price.currency || order.currency || 'USD'))} total / ${money(price.each, String(price.currency || order.currency || 'USD'))} each`);
    arrayValue(item.optionSummary).forEach((entry) => drawParagraph(context, `Option: ${entry}`, { size: 8.2, indent: 8 }));
    arrayValue(item.productionSummary).forEach((entry) => drawParagraph(context, `Production: ${entry}`, { size: 8.2, indent: 8 }));
    (arrayValue(item.productionBreakdown) as Array<Record<string, unknown>>).forEach((artwork, artworkIndex) => {
      drawParagraph(context, `Artwork ${artworkIndex + 1}: ${artwork.label || artwork.frontName || 'Artwork'}; Qty ${Number(artwork.quantity || 0)}; ${artwork.sizeLabel || item.sizeLabel || 'size not listed'}${artwork.sheetLabel ? `; ${artwork.sheetLabel}` : ''}`, { font: context.bold, size: 8.3, indent: 8 });
      drawParagraph(context, `Front: ${artwork.frontName || 'not recorded'} | ${artwork.frontStoragePath || 'no storage path'}`, { size: 7.7, indent: 18 });
      if (artwork.backName || artwork.backStoragePath) drawParagraph(context, `Back: ${artwork.backName || 'not recorded'} | ${artwork.backStoragePath || 'no storage path'}`, { size: 7.7, indent: 18 });
    });
    (arrayValue(item.artworkFiles) as Array<Record<string, unknown>>).forEach((file) => drawParagraph(context, `File: ${file.role || 'Artwork'} - ${file.name || 'unnamed'} - ${file.storagePath || 'no storage path'}${file.productionReference ? ` - ${file.productionReference}` : ''}`, { size: 7.7, indent: 8 }));
    (arrayValue(item.productionRecipes) as Array<Record<string, unknown>>).forEach((recipe) => {
      const placement = objectValue(recipe.placement);
      drawParagraph(context, `Recipe: ${recipe.role || 'side'}; source ${recipe.customerFileName || 'not recorded'}; artboard ${recipe.artboardWidthInches || '?'} x ${recipe.artboardHeightInches || '?'} in; fit ${recipe.fitMode || 'not recorded'}; placement ${Number(placement.width || 0) * 100}% x ${Number(placement.height || 0) * 100}% at ${Number(placement.x || 0) * 100}%, ${Number(placement.y || 0) * 100}%`, { size: 7.7, indent: 8 });
    });
    context.y -= 7;
  });
  context.y -= 12;
};

export const buildOrderReportPdf = async (args: { orders: OrderReportRow[]; fromLabel: string; toLabel: string; generatedAt?: string }) => {
  const document = await PDFDocument.create();
  document.setTitle(`Hue Studio Orders - ${args.fromLabel} to ${args.toLabel}`);
  document.setAuthor('Hue Graphics');
  document.setSubject('Hue Studio detailed order export');
  document.setCreator('Hue Studio Admin');
  document.setCreationDate(new Date(args.generatedAt || Date.now()));
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const context: PdfContext = { document, page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]), regular, bold, y: TOP_Y, pageNumber: 1, reportTitle: `${args.fromLabel} through ${args.toLabel}`, pageNumberTargets: [] };
  context.pageNumberTargets.push(context.page);
  context.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 52, width: PAGE_WIDTH, height: 52, color: navy });
  context.page.drawText('HUE STUDIO', { x: MARGIN, y: PAGE_HEIGHT - 31, size: 13, font: bold, color: rgb(1, 1, 1) });
  context.page.drawText(pdfText(context.reportTitle), { x: MARGIN + 102, y: PAGE_HEIGHT - 30, size: 9, font: regular, color: rgb(0.75, 0.88, 0.96) });

  context.page.drawText('Detailed Order Export', { x: MARGIN, y: context.y, size: 24, font: bold, color: navy });
  context.y -= 32;
  drawParagraph(context, `Orders created from ${args.fromLabel} through ${args.toLabel}. Generated ${dateTime(args.generatedAt || new Date().toISOString())}.`, { size: 10 });
  const currency = args.orders[0]?.currency || 'USD';
  const totals = args.orders.reduce<{ subtotal: number; discount: number; shipping: number; tax: number; total: number }>((sum, order) => ({
    subtotal: sum.subtotal + Number(order.subtotal || 0),
    discount: sum.discount + Number(order.discount || 0),
    shipping: sum.shipping + Number(order.shipping || 0),
    tax: sum.tax + Number(order.tax || 0),
    total: sum.total + Number(order.total || 0),
  }), { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0 });
  context.page.drawRectangle({ x: MARGIN, y: context.y - 86, width: CONTENT_WIDTH, height: 88, color: paleBlue, borderColor: rgb(0.72, 0.86, 0.96), borderWidth: 0.8 });
  const summary = [
    ['Orders', String(args.orders.length)],
    ['Subtotal', money(totals.subtotal, currency)],
    ['Discounts', money(-totals.discount, currency)],
    ['Shipping', money(totals.shipping, currency)],
    ['Tax', money(totals.tax, currency)],
    ['Total sales', money(totals.total, currency)],
  ];
  summary.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = MARGIN + 14 + column * 172;
    const y = context.y - 24 - row * 40;
    context.page.drawText(label.toUpperCase(), { x, y, size: 7.5, font: bold, color: blue });
    context.page.drawText(value, { x, y: y - 16, size: 13, font: bold, color: index === 5 ? green : navy });
  });
  context.y -= 106;
  if (!args.orders.length) drawParagraph(context, 'No orders were found in the selected date range.', { font: bold, size: 12 });
  args.orders.forEach((order, index) => drawOrder(context, order, index));

  context.pageNumberTargets.forEach((page, index) => {
    page.drawLine({ start: { x: MARGIN, y: 32 }, end: { x: PAGE_WIDTH - MARGIN, y: 32 }, thickness: 0.6, color: rgb(0.82, 0.85, 0.89) });
    page.drawText(`Hue Studio order export | Page ${index + 1} of ${context.pageNumberTargets.length}`, { x: MARGIN, y: 18, size: 7.5, font: regular, color: rgb(0.42, 0.47, 0.53) });
  });
  return document.save();
};
