import { zipSync } from 'fflate';
import { generateA4Sheets, generateLabels } from './label';
import { thermalRequest } from './thermal';
import { validateShipment, type Shipment } from './types';
import type { ArvonoOrder } from '../../shared/api';

export function dhakaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)!.value).join('-');
}
export function downloadName(kind: string, count: number, options: { now?: Date; id?: string; reprint?: boolean } = {}): string {
  const now = options.now ?? new Date();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now).replaceAll(':', '-');
  return `arvono-${kind}-${count}-label${count === 1 ? '' : 's'}${options.reprint ? '-reprint' : ''}-${dhakaDate(now)}_${time}-BDT-${(options.id ?? crypto.randomUUID()).slice(0, 8)}`;
}
export interface PrintOptions {
  format: 'a4' | 'individual' | 'thermal';
  size?: Shipment['size'];
  preset?: string;
  dpi?: 203 | 300;
  cutMarks?: boolean;
  splitSheets?: boolean;
}
export function sheetZip(pdfs: Uint8Array[], stem: string): Uint8Array {
  const files = Object.fromEntries(pdfs.map((pdf, index) => [`${stem}-sheet-${String(index + 1).padStart(3, '0')}-of-${String(pdfs.length).padStart(3, '0')}.pdf`, pdf]));
  return zipSync(files, { level: 0 });
}

/** Same address assembly as the original fulfillment integration. */
export function orderShipment(order: ArvonoOrder): Shipment {
  const address = order.shippingAddress;
  const parts = [address?.address];
  for (const value of [address?.city, address?.zip]) if (value && !parts.join(', ').toLowerCase().includes(value.toLowerCase())) parts.push(value);
  return validateShipment({ name: order.customer?.name, phone: order.customer?.phone, address: parts.filter(Boolean).join(', '),
    cod: order.codAmount, parcelId: order.consignmentId });
}

export async function renderDownload(shipments: Shipment[], options: PrintOptions, stem: string) {
  const blob = (bytes: Uint8Array, type: string) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
  if (options.format === 'a4') {
    const pdfs = await generateA4Sheets(shipments, { split: options.splitSheets, cutMarks: options.cutMarks });
    return options.splitSheets ? { blob: blob(sheetZip(pdfs, stem), 'application/zip'), filename: `${stem}.zip` }
      : { blob: blob(pdfs[0]!, 'application/pdf'), filename: `${stem}.pdf` };
  }
  if (options.format === 'thermal') {
    const job = thermalRequest(shipments, { ...(options.preset ? { preset: options.preset } : {}), dpi: String(options.dpi ?? 203) });
    return { blob: blob(await generateLabels(job.shipments, { thermal: true, dpi: job.dpi }), 'application/pdf'), filename: `${stem}.pdf` };
  }
  const sized = options.size ? shipments.map((shipment) => ({ ...shipment, size: options.size })) : shipments;
  return { blob: blob(await generateLabels(sized), 'application/pdf'), filename: `${stem}.pdf` };
}

/** Render the labels for a set of ARVONO orders, as the print shop downloads them. */
export async function renderOrders(orders: ArvonoOrder[], options: PrintOptions, meta: { id: string; reprint: boolean; preview?: boolean }) {
  const shipments = orders.map(orderShipment);
  const kind = options.format === 'a4' ? 'a4' : options.format;
  const stem = downloadName(kind, shipments.length, { id: meta.id, reprint: meta.reprint });
  return renderDownload(shipments, meta.preview ? { ...options, splitSheets: false } : options, stem);
}
