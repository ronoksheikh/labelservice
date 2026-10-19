import { randomUUID } from 'node:crypto';
import { zipSync } from 'fflate';
import { generateA4Sheets, generateLabels } from './label.js';
import { thermalRequest } from './thermal.js';
import { LabelError, type Shipment } from './types.js';

export function dhakaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)!.value).join('-');
}
export function downloadName(kind: string, count: number, options: { now?: Date; id?: string; reprint?: boolean } = {}): string {
  const now = options.now ?? new Date();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now).replaceAll(':', '-');
  return `arvono-${kind}-${count}-label${count === 1 ? '' : 's'}${options.reprint ? '-reprint' : ''}-${dhakaDate(now)}_${time}-BDT-${(options.id ?? randomUUID()).slice(0, 8)}`;
}
export interface PrintOptions {
  format: 'a4' | 'individual' | 'thermal';
  size?: Shipment['size'];
  preset?: string;
  dpi?: 203 | 300;
  cutMarks?: boolean;
  splitSheets?: boolean;
}
export function validatePrintOptions(input: unknown): PrintOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new LabelError('Choose a print format.', 400, 'INVALID_INPUT', 'format');
  const value = input as Record<string, unknown>;
  if (!['a4', 'individual', 'thermal'].includes(String(value.format))) throw new LabelError('Choose A4, individual or thermal labels.', 400, 'INVALID_INPUT', 'format');
  for (const field of ['cutMarks', 'splitSheets']) if (value[field] !== undefined && typeof value[field] !== 'boolean') throw new LabelError(`${field} must be a boolean.`, 400, 'INVALID_INPUT', field);
  if (value.preset !== undefined && typeof value.preset !== 'string') throw new LabelError('preset must be a string.', 400, 'INVALID_INPUT', 'preset');
  if (value.dpi !== undefined && value.dpi !== 203 && value.dpi !== 300) throw new LabelError('dpi must be 203 or 300.', 400, 'INVALID_INPUT', 'dpi');
  return { format: value.format as PrintOptions['format'], ...(value.size !== undefined ? { size: value.size as Shipment['size'] } : {}),
    ...(value.preset !== undefined ? { preset: value.preset as string } : {}), ...(value.dpi !== undefined ? { dpi: value.dpi as 203 | 300 } : {}),
    cutMarks: value.cutMarks !== false, splitSheets: value.splitSheets === true };
}
export function sheetZip(pdfs: Buffer[], stem: string): Buffer {
  const files = Object.fromEntries(pdfs.map((pdf, index) => [`${stem}-sheet-${String(index + 1).padStart(3, '0')}-of-${String(pdfs.length).padStart(3, '0')}.pdf`, pdf]));
  return Buffer.from(zipSync(files, { level: 0 }));
}
export async function renderDownload(shipments: Shipment[], options: PrintOptions, stem: string) {
  if (options.format === 'a4') {
    const pdfs = await generateA4Sheets(shipments, { split: options.splitSheets, cutMarks: options.cutMarks });
    return options.splitSheets ? { bytes: sheetZip(pdfs, stem), filename: `${stem}.zip`, type: 'application/zip' }
      : { bytes: pdfs[0]!, filename: `${stem}.pdf`, type: 'application/pdf' };
  }
  if (options.format === 'thermal') {
    const job = thermalRequest(shipments, { ...(options.preset ? { preset: options.preset } : {}), dpi: String(options.dpi ?? 203) });
    return { bytes: await generateLabels(job.shipments, { thermal: true, dpi: job.dpi }), filename: `${stem}.pdf`, type: 'application/pdf' };
  }
  return { bytes: await generateLabels(shipments), filename: `${stem}.pdf`, type: 'application/pdf' };
}
