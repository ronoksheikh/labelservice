import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { createBarcode, drawBarcode, type Barcode } from './barcode.js';
import { LabelError, pageDimensions, type LabelRenderOptions, type Shipment } from './types.js';
import { A4, drawSheetGuides, sheetPosition } from './sheet.js';

const COLORS = { background: '#111111', text: '#FFFFFF', muted: '#A3A3A3', divider: '#3D3D3D' };
const THERMAL_COLORS = { background: '#FFFFFF', text: '#000000', muted: '#000000', divider: '#000000' };
const fontPath = (name: string) => fileURLToPath(new URL(`../assets/fonts/${name}.ttf`, import.meta.url));
const FONTS = {
  brand: fontPath('InstrumentSerif-Regular'),
  regular: fontPath('InstrumentSans-Regular'),
  semibold: fontPath('InstrumentSans-SemiBold'),
  bold: fontPath('InstrumentSans-Bold'),
  bangla: fontPath('AnekBangla-Regular'),
  banglaSemibold: fontPath('AnekBangla-SemiBold'),
};
type Font = keyof typeof FONTS;
interface TextBlock { lines: string[]; font: Font; size: number; lineHeight: number; height: number; fitsWidth: boolean }
type Recipient = Pick<Layout, 'name' | 'phone' | 'address' | 'gap'>;
interface Layout {
  width: number; height: number; scale: number; margin: number; inner: number;
  headerY: number; brandSize: number; headerLineY: number; recipientY: number; dividerY: number;
  name: TextBlock; phone: TextBlock; address: TextBlock; gap: number;
  paymentY: number; amountSize: number; amount: string; parcel: TextBlock;
  columnWidth: number; rightX: number; panelY: number; panelHeight: number;
  barcode: Barcode; barcodeText: TextBlock; footerY: number;
}

const graphemes = new Intl.Segmenter('bn', { granularity: 'grapheme' });
const fontFor = (text: string, semibold = false): Font => /[\u0980-\u09FF]/u.test(text)
  ? (semibold ? 'banglaSemibold' : 'bangla') : (semibold ? 'semibold' : 'regular');

function measure(doc: PDFKit.PDFDocument, text: string, font: Font, size: number, width: number, gap = 0): TextBlock {
  doc.font(font).fontSize(size);
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (doc.widthOfString(candidate) <= width - 0.1) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      if (doc.widthOfString(word) <= width - 0.1) { line = word; continue; }
      for (const { segment } of graphemes.segment(word)) {
        if (line && doc.widthOfString(line + segment) > width - 0.1) {
          lines.push(line);
          line = '';
        }
        line += segment;
      }
    }
    lines.push(line);
  }
  const lineHeight = doc.currentLineHeight(false) + gap;
  return { lines, font, size, lineHeight, height: lines.length * lineHeight - gap,
    fitsWidth: lines.every((line) => doc.widthOfString(line) <= width - 0.1) };
}

function singleLine(doc: PDFKit.PDFDocument, text: string, font: Font, preferred: number, minimum: number, width: number): TextBlock | undefined {
  for (let size = Math.max(preferred, minimum); ; size = Math.max(minimum, size - 0.25)) {
    const block = measure(doc, text, font, size, width);
    if (block.lines.length === 1 && block.fitsWidth) return block;
    if (size === minimum) return undefined;
  }
}

function plan(doc: PDFKit.PDFDocument, shipment: Shipment, options: LabelRenderOptions = {}): Layout {
  const [width, height] = pageDimensions(shipment);
  const scale = Math.min(1.15, Math.max(0.85, Math.min(width, height) / 216));
  const margin = options.thermal ? Math.max(5 * 72 / 25.4, 16 * scale) : 16 * scale;
  const inner = width - 2 * margin;
  const headerY = 12 * scale;
  const deliverySize = options.thermal ? Math.max(5.5, 5 * scale) : 5 * scale;
  const deliveryWidth = doc.font(options.thermal ? 'semibold' : 'regular').fontSize(deliverySize)
    .widthOfString('DELIVERY LABEL', { characterSpacing: 0.9 * deliverySize / 5.4 });
  let brandSize = 22 * scale;
  while (brandSize > (options.thermal ? 14 : 18) * scale && doc.font('brand').fontSize(brandSize)
    .widthOfString('ARVONO') + 10 * scale + deliveryWidth > inner) brandSize -= 0.25;
  const headerLineY = headerY + 25 * scale;
  const recipientY = headerLineY + 8 * scale;
  const footerY = height - 16 * scale;
  const barcode = createBarcode(shipment.parcelId, inner, scale, options.thermal ? options.dpi ?? 203 : undefined);
  const barcodeText = singleLine(doc, shipment.parcelId, 'regular', 7 * scale, 6.5, inner - 12 * scale);
  if (!barcodeText) throw new LabelError('The parcel ID text cannot fit below the barcode.', 422, 'CONTENT_DOES_NOT_FIT', 'parcelId');
  const panelHeight = 4 * scale + barcode.height + 2 * scale + barcodeText.height + 3 * scale;
  const panelY = footerY - 8 * scale - panelHeight;
  const columnWidth = (inner - 16 * scale) / 2;
  const rightX = margin + inner - columnWidth;
  const amount = shipment.cod.toLocaleString('en-US', { maximumFractionDigits: 2 });
  let amountSize = 21 * scale;
  while (amountSize >= 12) {
    const currencyWidth = doc.font('banglaSemibold').fontSize(amountSize * 0.8).widthOfString('৳');
    const amountWidth = doc.font('bold').fontSize(amountSize).widthOfString(amount);
    if (currencyWidth + 2 * scale + amountWidth <= columnWidth) break;
    amountSize -= 0.25;
  }
  if (amountSize < 12) throw new LabelError('The COD amount cannot fit this label width.', 422, 'CONTENT_DOES_NOT_FIT', 'cod');
  const parcel = singleLine(doc, shipment.parcelId, 'semibold', 10.5 * scale, 7, columnWidth);
  if (!parcel) throw new LabelError('The parcel ID cannot fit the payment column. Use a wider label.', 422, 'CONTENT_DOES_NOT_FIT', 'parcelId');
  const paymentY = panelY - 36 * scale;
  const dividerY = paymentY - 8 * scale;
  const recipientHeight = dividerY - 5 * scale - recipientY - 6 * scale;
  if (recipientHeight <= 0) throw new LabelError('This label is too short for the header, payment and barcode regions.',
    422, 'CONTENT_DOES_NOT_FIT', 'size');
  const recipientAt = (compact: number, factor = 1): Recipient => ({
    gap: (3 - compact * 2) * scale * factor,
    name: measure(doc, shipment.name, fontFor(shipment.name, true), (16 - compact * 2) * scale * factor, inner),
    phone: measure(doc, shipment.phone, fontFor(shipment.phone), Math.max(7.5, (8.5 - compact * 0.5) * scale) * factor, inner),
    address: measure(doc, shipment.address, fontFor(shipment.address), Math.max(7, (8.2 - compact * 1.2) * scale) * factor,
      inner, (1.1 - compact * 0.5) * scale * factor),
  });
  const fits = ({ name, phone, address, gap }: Recipient) =>
    name.fitsWidth && phone.fitsWidth && address.fitsWidth &&
    name.height + phone.height + address.height + 3 * gap <= recipientHeight;
  let recipient: Recipient | undefined;
  // Keep the usual typography when it fits. Long details shrink within their own
  // region, preserving every grapheme and leaving payment/barcode geometry intact.
  for (let step = 0; step <= 10; step++) {
    const candidate = recipientAt(step / 10);
    if (fits(candidate)) { recipient = candidate; break; }
  }
  if (!recipient) {
    let lower = 0, upper = 1;
    // Find the largest fitting scale; there is no fixed recipient font-size floor.
    for (let step = 0; step < 20; step++) {
      const factor = (lower + upper) / 2;
      const candidate = recipientAt(1, factor);
      if (fits(candidate)) { lower = factor; recipient = candidate; }
      else upper = factor;
    }
  }
  if (!recipient) throw new LabelError('This label has no usable space for recipient details.',
    422, 'CONTENT_DOES_NOT_FIT', 'size');
  return { width, height, scale, margin, inner, headerY, brandSize, headerLineY, recipientY, dividerY,
    ...recipient, paymentY, amountSize, amount, parcel, columnWidth, rightX,
    panelY, panelHeight, barcode, barcodeText, footerY };
}

function text(doc: PDFKit.PDFDocument, block: TextBlock, x: number, y: number, color = COLORS.text): void {
  doc.font(block.font).fontSize(block.size).fillColor(color);
  for (const [index, line] of block.lines.entries()) {
    doc.text(line, x, y + index * block.lineHeight, { lineBreak: false, baseline: 'top' });
  }
}

function caption(doc: PDFKit.PDFDocument, label: string, x: number, y: number, size: number, align: 'left' | 'right' | 'center' = 'left', width = 0, color = COLORS.muted, font: Font = 'regular'): void {
  doc.font(font).fontSize(size).fillColor(color);
  const preferredSpacing = 0.9 * size / 5.4;
  const spacing = width > 0 ? Math.min(preferredSpacing, Math.max(0, (width - doc.widthOfString(label)) / Math.max(1, label.length - 1))) : preferredSpacing;
  const textWidth = doc.widthOfString(label, { characterSpacing: spacing });
  const offset = align === 'right' ? width - textWidth : align === 'center' ? (width - textWidth) / 2 : 0;
  doc.text(label, x + offset, y, { lineBreak: false, baseline: 'top', characterSpacing: spacing });
}

function draw(doc: PDFKit.PDFDocument, p: Layout, options: LabelRenderOptions = {}, offsetX = 0, offsetY = 0): void {
  const { scale: s, margin: x, inner } = p;
  const colors = options.thermal ? THERMAL_COLORS : COLORS;
  const dot = 72 / (options.dpi ?? 203);
  const snap = (position: number) => options.thermal ? Math.round(position / dot) * dot : position;
  const meta = (label: string, left: number, top: number, size: number, align: 'left' | 'right' = 'left', width = 0) =>
    caption(doc, label, left, top, options.thermal ? Math.max(5.5, size) : size, align, width, colors.muted, options.thermal ? 'semibold' : 'regular');
  doc.save().translate(offsetX, offsetY);
  doc.rect(0, 0, p.width, p.height).fill(colors.background);
  const dividerWidth = options.thermal ? Math.ceil(0.45 * s / dot) * dot : 0.45 * s;
  const divider = (y: number) => doc.moveTo(x, y).lineTo(x + inner, y).lineWidth(dividerWidth).stroke(colors.divider);
  doc.font('brand').fontSize(p.brandSize).fillColor(colors.text)
    .text('ARVONO', x, p.headerY + 20 * s, { lineBreak: false, baseline: 'alphabetic' });
  meta('DELIVERY LABEL', x, p.headerY + 8.8 * s, 5 * s, 'right', inner);
  divider(p.headerLineY);
  meta('SHIP TO', x, p.recipientY, 5.3 * s);
  let y = p.recipientY + 6 * s + p.gap;
  text(doc, p.name, x, y, colors.text);
  y += p.name.height + p.gap;
  text(doc, p.phone, x, y, colors.text);
  y += p.phone.height + p.gap;
  text(doc, p.address, x, y, colors.muted);
  divider(p.dividerY);
  meta('CASH ON DELIVERY', x, p.paymentY, 5 * s, 'left', p.columnWidth);
  meta('PARCEL ID', p.rightX, p.paymentY, 5 * s, 'left', p.columnWidth);
  const valueY = p.paymentY + 10 * s;
  // Share an alphabetic baseline so the Bengali taka glyph and Latin figures align.
  const baseline = valueY + 17 * s;
  const currencySize = p.amountSize * 0.8;
  doc.font('banglaSemibold').fontSize(currencySize).fillColor(colors.text)
    .text('৳', x, baseline, { lineBreak: false, baseline: 'alphabetic' });
  const currencyWidth = doc.widthOfString('৳');
  doc.font('bold').fontSize(p.amountSize).text(p.amount, x + currencyWidth + 2 * s, baseline, { lineBreak: false, baseline: 'alphabetic' });
  text(doc, p.parcel, p.rightX, valueY + 5.5 * s, colors.text);
  doc.rect(x, p.panelY, inner, p.panelHeight).fill('#FFFFFF');
  drawBarcode(doc, p.barcode, snap(x + (inner - p.barcode.width) / 2), snap(p.panelY + 4 * s));
  doc.font(p.barcodeText.font).fontSize(p.barcodeText.size);
  const idWidth = doc.widthOfString(p.barcodeText.lines[0]!);
  text(doc, p.barcodeText, x + (inner - idWidth) / 2, p.panelY + 4 * s + p.barcode.height + 2 * s, '#000000');
  const footerBrandSize = options.thermal ? Math.max(6, 6 * s) : 6 * s;
  const footerSize = options.thermal ? Math.max(5.5, 4.6 * s) : 4.6 * s;
  const footerBrandWidth = doc.font('brand').fontSize(footerBrandSize).widthOfString('ARVONO');
  const footerTagline = ' · CARE IN EVERY DETAIL';
  const footerSpacing = 0.9 * footerSize / 5.4;
  const footerTaglineWidth = doc.font('regular').fontSize(footerSize)
    .widthOfString(footerTagline, { characterSpacing: footerSpacing });
  const footerX = x + (inner - footerBrandWidth - footerTaglineWidth) / 2;
  const footerBaseline = p.footerY + 5.2 * s;
  doc.font('brand').fontSize(footerBrandSize).fillColor(colors.muted)
    .text('ARVONO', footerX, footerBaseline, { lineBreak: false, baseline: 'alphabetic' });
  doc.font('regular').fontSize(footerSize).text(footerTagline, footerX + footerBrandWidth, footerBaseline,
    { lineBreak: false, baseline: 'alphabetic', characterSpacing: footerSpacing });
  doc.restore();
}

function createDocument(format: 'label' | 'a4' | 'thermal' = 'label'): PDFKit.PDFDocument {
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, bufferPages: false,
    compress: true, info: { Title: format === 'a4' ? 'ARVONO A4 Print Sheets' : format === 'thermal' ? 'ARVONO Thermal Labels' : 'ARVONO Delivery Labels', Author: 'ARVONO', Creator: 'ARVONO Label Generator' } });
  for (const [alias, path] of Object.entries(FONTS)) doc.registerFont(alias, path);
  return doc;
}

async function planAll(doc: PDFKit.PDFDocument, shipments: Shipment[], options: LabelRenderOptions = {}): Promise<Layout[]> {
  const layouts: Layout[] = [];
  for (const [index, shipment] of shipments.entries()) {
    try { layouts.push(plan(doc, shipment, options)); }
    catch (error) {
      if (error instanceof LabelError) throw new LabelError(error.message, error.statusCode, error.code, error.field, index);
      throw error;
    }
    if (index % 25 === 24) await setImmediate();
  }
  return layouts;
}

async function renderPdf(doc: PDFKit.PDFDocument, layouts: Layout[], sheet?: { offset: number; total: number; cutMarks: boolean }, options: LabelRenderOptions = {}): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  try {
    for (const [index, layout] of layouts.entries()) {
      if (sheet) {
        const slot = index % A4.capacity;
        if (slot === 0) {
          doc.addPage({ size: [A4.width, A4.height], margin: 0 });
          drawSheetGuides(doc, sheet.offset + Math.floor(index / A4.capacity), sheet.total,
            Math.min(A4.capacity, layouts.length - index), sheet.cutMarks);
        }
        const { x, y } = sheetPosition(slot);
        // Translation only: each label remains exactly 216 × 216 pt, with no scaling.
        draw(doc, layout, {}, x, y);
      } else {
        doc.addPage({ size: [layout.width, layout.height], margin: 0 });
        draw(doc, layout, options);
      }
      if (index % 25 === 24) await setImmediate();
    }
    doc.end();
    return await complete;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

/** Validate all page layouts first. A bad batch returns JSON, never a partial PDF. */
export async function generateLabels(shipments: Shipment[], options: LabelRenderOptions = {}): Promise<Buffer> {
  const doc = createDocument(options.thermal ? 'thermal' : 'label');
  try { return await renderPdf(doc, await planAll(doc, shipments, options), undefined, options); }
  catch (error) { doc.destroy(); throw error; }
}

export async function generateA4Sheets(shipments: Shipment[], options: { split?: boolean; cutMarks?: boolean } = {}): Promise<Buffer[]> {
  for (const [index, shipment] of shipments.entries()) {
    if (pageDimensions(shipment).some((dimension) => Math.abs(dimension - A4.labelSize) > 0.00001)) {
      throw new LabelError('A4 sheets require 3 × 3-inch (76.2 × 76.2 mm) labels. Omit size or use these dimensions.',
        400, 'INVALID_INPUT', 'size', index);
    }
  }
  const doc = createDocument('a4');
  try {
    const layouts = await planAll(doc, shipments);
    const total = Math.ceil(layouts.length / A4.capacity);
    if (!options.split) return [await renderPdf(doc, layouts, { offset: 0, total, cutMarks: options.cutMarks ?? true })];
    const pdfs: Buffer[] = [];
    for (let page = 0; page < total; page++) {
      const pageDoc = page === 0 ? doc : createDocument('a4');
      pdfs.push(await renderPdf(pageDoc, layouts.slice(page * A4.capacity, (page + 1) * A4.capacity),
        { offset: page, total, cutMarks: options.cutMarks ?? true }));
      await setImmediate();
    }
    return pdfs;
  } catch (error) { doc.destroy(); throw error; }
}
