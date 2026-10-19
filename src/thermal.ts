import { LabelError, pageDimensions, type LabelSize, type PrinterDpi, type Shipment } from './types.js';

export const THERMAL_PRESETS: ReadonlyArray<{ id: string; size: LabelSize }> = [
  { id: '4x6', size: { width: 4, height: 6, unit: 'in' } },
  { id: '3x3', size: { width: 3, height: 3, unit: 'in' } },
  { id: '100x150mm', size: { width: 100, height: 150, unit: 'mm' } },
  { id: '100x100mm', size: { width: 100, height: 100, unit: 'mm' } },
  { id: '100x75mm', size: { width: 100, height: 75, unit: 'mm' } },
  { id: '80x100mm', size: { width: 80, height: 100, unit: 'mm' } },
  { id: '62x100mm', size: { width: 62, height: 100, unit: 'mm' } },
  { id: '58x100mm', size: { width: 58, height: 100, unit: 'mm' } },
];

/** A roll-printing job uses one stock size; custom size is taken from the first label. */
export function thermalRequest(shipments: Shipment[], query: Record<string, unknown>): { shipments: Shipment[]; dpi: PrinterDpi } {
  const preset = query.preset === undefined ? undefined : THERMAL_PRESETS.find((entry) => entry.id === query.preset);
  if (query.preset !== undefined && !preset) {
    throw new LabelError('Unknown thermal preset. See GET /thermal/presets for available paper sizes.', 400, 'INVALID_INPUT', 'preset');
  }
  if (query.dpi !== undefined && query.dpi !== '203' && query.dpi !== '300') {
    throw new LabelError('dpi must be "203" or "300".', 400, 'INVALID_INPUT', 'dpi');
  }
  const dpi: PrinterDpi = query.dpi === '300' ? 300 : 203;
  const size = preset?.size ?? shipments[0]?.size ?? THERMAL_PRESETS[0]!.size;
  const expected = pageDimensions({ ...shipments[0]!, size });
  return { dpi, shipments: shipments.map((shipment, index) => {
    if (shipment.size && pageDimensions(shipment).some((dimension, axis) => Math.abs(dimension - expected[axis]!) > 0.00001)) {
      throw new LabelError('Every label in a thermal print job must match the selected paper size. Omit size to inherit it.',
        400, 'INVALID_INPUT', 'size', index);
    }
    return { ...shipment, size };
  }) };
}
