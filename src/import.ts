import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { LabelError, type Shipment } from './types.js';
import { brokenBanglaOrder, cleanPdfText as clean, damagedText as damaged, fieldLines, type PositionedText } from './pdf-text.js';
import { BanglaRecovery } from './bangla.js';
export type { PositionedText } from './pdf-text.js';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
type Field = keyof Omit<Shipment, 'size'>;
export interface ImportIssue { field: Field | 'page'; code: string; message: string }
export interface ImportedLabel {
  page: number;
  fields: Omit<Shipment, 'size' | 'cod'> & { cod: number | null };
  metadata: Record<string, string>;
  issues: ImportIssue[];
  recovery?: { field: 'name' | 'address'; original: string; text: string; method: 'local-ocr'; confidence: number }[];
}

const digits = (text: string) => text.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));

/** Courier contents are inert data. Only known field anchors are interpreted. */
export function extractPage(items: PositionedText[], page: number): ImportedLabel {
  const values = new Map<string, string[]>();
  const counts = new Map<string, number>();
  for (const line of fieldLines(items)) {
    if (line.start) counts.set(line.key, (counts.get(line.key) ?? 0) + 1);
    const existing = values.get(line.key) ?? [];
    existing.push(line.value); values.set(line.key, existing);
  }
  const read = (key: string) => (values.get(key) ?? []).join(' ').replace(/- (?=\d)/g, '-').trim();
  let address = read('ADDRESS');
  const area = read('AREA');
  if (area && !address.toLocaleLowerCase().includes(area.toLocaleLowerCase())) address += `${address ? ', ' : ''}${area}`;
  const amount = digits(read('CASHONDELIVERY')).replace(/(?:BDT|TK\.?|TAKA|৳)/gi, '').replace(/[\s,]/g, '');
  const cod = /^(?:\d+(?:\.\d{1,2})?)$/.test(amount) && Number(amount) <= 999_999_999.99 ? Number(amount) : null;
  const fields = { name: clean(read('NAME')), phone: clean(read('PHONE')), address: clean(address),
    parcelId: clean(digits(read('SFID'))), cod };
  const issues: ImportIssue[] = [];
  for (const field of ['parcelId', 'name', 'phone', 'address', 'cod'] as const) {
    const value = fields[field];
    if (value === '' || value === null) issues.push({ field, code: 'MISSING_FIELD', message: `${field === 'parcelId' ? 'SF-ID' : field === 'cod' ? 'COD amount' : field} was not found. Enter it from the original label.` });
    else if (typeof value === 'string' && damaged.test(value)) issues.push({ field, code: 'UNREADABLE_TEXT', message: 'The PDF font has unreadable characters. Correct this field using the original label.' });
    else if ((field === 'name' || field === 'address') && typeof value === 'string' && brokenBanglaOrder(value)) issues.push({ field, code: 'BROKEN_BANGLA_ORDER', message: 'Bangla vowel order appears damaged. Check this field against the original label.' });
  }
  const sfIdAnchors = items.filter((item) => /^SF\s*[-–]?\s*ID\s*(?::|$)/i.test(item.str.trim())).length;
  if (sfIdAnchors > 1 || (counts.get('NAME') ?? 0) > 1) issues.push({ field: 'page', code: 'MULTIPLE_LABELS', message: 'Multiple labels were detected on this page. Import a PDF with one courier label per page.' });
  if (!counts.has('SFID')) issues.push({ field: 'page', code: 'UNRECOGNIZED_LAYOUT', message: 'No SF-ID field was found. This page may be a scan or an unsupported layout; enter the details manually.' });
  return { page, fields, metadata: Object.fromEntries(['INVOICE', 'AREA', 'NOTE', 'DELIVERY', 'WEIGHT'].map((key) => [key.toLowerCase(), clean(read(key))]).filter(([, value]) => value)), issues };
}

export async function importPdf(buffer: Buffer): Promise<{ pageCount: number; labels: ImportedLabel[] }> {
  if (!buffer.length || buffer.length > MAX_PDF_BYTES) throw new LabelError('Choose a PDF up to 10 MiB.', 413, 'PDF_TOO_LARGE');
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new LabelError('This file is not a PDF.', 400, 'INVALID_PDF');
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false,
    disableFontFace: true, verbosity: 0, stopAtErrors: true });
  const recovery = new BanglaRecovery();
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 500) throw new LabelError('Import up to 500 pages per PDF.', 400, 'TOO_MANY_PAGES');
    const labels: ImportedLabel[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is typeof item & PositionedText => 'str' in item);
      let label = extractPage(items, number);
      if (!label.issues.some((issue) => issue.field === 'page') && label.issues.some((issue) =>
        ['UNREADABLE_TEXT', 'BROKEN_BANGLA_ORDER'].includes(issue.code) && ['name', 'address'].includes(issue.field))) {
        try {
          const result = await recovery.recover(page, items);
          if (result.fields.length) {
            const original = label;
            label = extractPage(result.items, number);
            label.recovery = result.fields.map(({ field, confidence }) => ({ field, confidence, method: 'local-ocr', original: original.fields[field], text: label.fields[field] }));
          }
        } catch { /* A missing OCR model or an unreadable image keeps the manual-review path. */ }
      }
      labels.push(label);
      page.cleanup();
    }
    return { pageCount: pdf.numPages, labels };
  } catch (error) {
    if (error instanceof LabelError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') throw new LabelError('This PDF is password protected. Upload an unlocked copy.', 400, 'ENCRYPTED_PDF');
    throw new LabelError('Unable to read this PDF. Try downloading a fresh copy from the courier.', 400, 'INVALID_PDF');
  } finally { await recovery.close(); await task.destroy(); }
}
