/** Order payload from the ARVONO dispatch API (GET /printable, POST /claim). */
export interface ArvonoOrder {
  orderId: number;
  orderName: string;
  orderNumber?: string | number;
  invoice?: string | null;
  consignmentId: string;
  trackingCode?: string | null;
  customer: { name: string; phone: string; alternativePhone?: string | null };
  shippingAddress: { address: string; city?: string | null; zip?: string | null; country?: string | null };
  items?: { title: string; variant?: string | null; sku?: string | null; quantity: number }[];
  totalQuantity?: number;
  codAmount: number;
  deliveryType?: string;
  note?: string | null;
  bookedAt?: string;
  bookedDate?: string;
  labelStatus: string;
  printJobId?: string | null;
  reservedUntil?: string | null;
  printedAt?: string | null;
  printCount?: number;
}

export interface OrdersPage { range?: string; status: string; count: number; nextCursor: string | null; orders: ArvonoOrder[] }

export interface Summary {
  date?: string;
  confirmedOrders: number; bookedConsignments: number;
  unprinted: number; reserved: number; printed: number; printedOnDate: number;
  awaitingSort: number; sorted: number; dispatched: number; cancelledAfterBooking: number;
  backlog: { unprinted: number; reserved: number; awaitingSort: number; awaitingPickup: number };
}

export type RequestMode = 'new' | 'reprint';
/** claiming/confirming/releasing are in-flight states; they can be retried safely. */
export type RequestStatus = 'claiming' | 'ready' | 'confirming' | 'releasing' | 'printed' | 'partial' | 'released' | 'failed';

export interface PrintEvent { id: number; action: string; actor: string; detail: string | null; createdAt: string }

export interface PrintRequest {
  id: string;
  token: string;
  mode: RequestMode;
  note: string | null;
  reason: string | null;
  status: RequestStatus;
  expired: boolean;
  upstreamJobId: string | null;
  expiresAt: string | null;
  requestedCount: number;
  orders: ArvonoOrder[];
  printedIds: number[] | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  events?: PrintEvent[];
}

/** What a print shop sees through its link: no internal job ids. */
export type SharedPrintRequest = Omit<PrintRequest, 'token' | 'upstreamJobId' | 'events'>;

export interface Session { authenticated: boolean; configured: boolean; today: string }

export const REPRINT_REASONS = [
  'Label damaged/smudged',
  'Printer jam – label lost',
  'Wrong label stuck on parcel',
  'Parcel repacked',
  'Address corrected',
];
