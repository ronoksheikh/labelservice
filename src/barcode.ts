import bwipjs from 'bwip-js';
import { LabelError, type PrinterDpi } from './types.js';

export interface Barcode {
  widths: number[];
  modules: number;
  moduleWidth: number;
  quietZone: number;
  width: number;
  height: number;
}

/** Raw BWIPP widths become PDF rectangles; there is no raster image or SVG parser. */
export function createBarcode(parcelId: string, panelWidth: number, scale: number, dpi?: PrinterDpi): Barcode {
  const result = bwipjs.raw({ bcid: 'code128', text: parcelId });
  const encoded = result[0];
  if (!encoded || !('sbs' in encoded)) throw new Error('Code 128 encoder returned no bars.');
  const modules = encoded.sbs.reduce((sum, width) => sum + width, 0);
  // Reserve 10-module quiet zones and keep the physical module at least 2/203 inch.
  const maximum = Math.min(1.4 * scale, (panelWidth - 12 * scale) / (modules + 20));
  const dot = dpi ? 72 / dpi : undefined;
  const moduleWidth = dot ? Math.floor(maximum / dot + 0.00000001) * dot : maximum;
  if (moduleWidth < 72 * 2 / 203 - 0.00000001) {
    throw new LabelError(
      'parcelId is too long for a reliably scannable barcode at this width. Use a wider label or shorter parcelId.',
      422, 'BARCODE_DOES_NOT_FIT', 'parcelId',
    );
  }
  const height = Math.max(18, 20 * scale, modules * moduleWidth * 0.15);
  return {
    widths: encoded.sbs,
    modules,
    moduleWidth,
    quietZone: 10 * moduleWidth,
    width: modules * moduleWidth,
    height: dot ? Math.ceil(height / dot) * dot : height,
  };
}

export function drawBarcode(doc: PDFKit.PDFDocument, barcode: Barcode, x: number, y: number): void {
  let cursor = x;
  doc.save().fillColor('#000000');
  barcode.widths.forEach((modules, index) => {
    const width = modules * barcode.moduleWidth;
    if (index % 2 === 0) doc.rect(cursor, y, width, barcode.height);
    cursor += width;
  });
  doc.fill().restore();
}
