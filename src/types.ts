export interface LabelSize {
  width: number;
  height: number;
  unit: 'in' | 'mm';
}

export interface Shipment {
  name: string;
  phone: string;
  address: string;
  cod: number;
  parcelId: string;
  size?: LabelSize;
}

export type PrinterDpi = 203 | 300;
export interface LabelRenderOptions {
  thermal?: boolean;
  dpi?: PrinterDpi;
}

export class LabelError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 422,
    public readonly code = 'CONTENT_DOES_NOT_FIT',
    public readonly field?: string,
    public readonly labelIndex?: number,
  ) {
    super(message);
    this.name = 'LabelError';
  }
}

const invalid = (message: string, field: string): never => {
  throw new LabelError(message, 400, 'INVALID_INPUT', field);
};

/** Do not coerce identifiers: both their type and leading zeros matter. */
export function validateShipment(input: unknown): Shipment {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return invalid('Each shipment must be a JSON object.', 'shipment');
  }
  const value = input as Record<string, unknown>;
  const readText = (field: string, max: number, multiline = false): string => {
    const raw = value[field];
    if (typeof raw !== 'string' || !raw.trim() || raw.length > max) {
      return invalid(`${field} must be a non-empty string of at most ${max} characters.`, field);
    }
    const normalized = raw.trim().replace(/\r\n?/g, '\n');
    const controls = multiline ? /[\x00-\x08\x0B-\x1F\x7F]/ : /[\x00-\x1F\x7F]/;
    if (controls.test(normalized)) return invalid(`${field} contains unsupported control characters.`, field);
    return normalized;
  };
  const name = readText('name', 160);
  const phone = readText('phone', 40);
  const address = readText('address', 1600, true);
  const parcelId = readText('parcelId', 80);
  if (!/^[\x21-\x7E]+$/.test(parcelId)) {
    return invalid('parcelId must contain printable ASCII characters without spaces (Code 128).', 'parcelId');
  }
  const cod = value.cod;
  if (typeof cod !== 'number' || !Number.isFinite(cod) || cod < 0 || cod > 999_999_999.99 ||
      Math.abs(cod * 100 - Math.round(cod * 100)) > 0.0001) {
    return invalid('cod must be a finite amount from 0 to 999999999.99, with at most two decimal places.', 'cod');
  }
  let size: LabelSize | undefined;
  if (value.size !== undefined) {
    const raw = value.size;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return invalid('size must be an object with width, height, and unit.', 'size');
    }
    const { width, height, unit } = raw as Record<string, unknown>;
    if (unit !== 'in' && unit !== 'mm') return invalid('size.unit must be "in" or "mm".', 'size.unit');
    const factor = unit === 'in' ? 72 : 72 / 25.4;
    for (const [field, dimension] of [['width', width], ['height', height]] as const) {
      if (typeof dimension !== 'number' || !Number.isFinite(dimension) ||
          dimension * factor < 144 - 0.00001 || dimension * factor > 864 + 0.00001) {
        return invalid(`size.${field} must be between 2 and 12 inches (50.8–304.8 mm).`, `size.${field}`);
      }
    }
    size = { width: width as number, height: height as number, unit };
  }
  return { name, phone, address, cod, parcelId, ...(size ? { size } : {}) };
}

export function pageDimensions(shipment: Shipment): [number, number] {
  const { width, height, unit } = shipment.size ?? { width: 3, height: 3, unit: 'in' };
  const points = unit === 'in' ? 72 : 72 / 25.4;
  return [width * points, height * points];
}

export function validateBatch(input: unknown): Shipment[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 1000) {
    throw new LabelError('The request body must be an array of 1 to 1000 shipments.', 400, 'INVALID_INPUT', 'shipments');
  }
  return input.map((value, index) => {
    try { return validateShipment(value); }
    catch (error) {
      if (error instanceof LabelError) throw new LabelError(error.message, error.statusCode, error.code, error.field, index);
      throw error;
    }
  });
}
