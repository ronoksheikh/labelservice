// Payment gateways. A gateway starts a payment (returning the page to send the buyer to) and verifies it
// server-to-server. Orders.confirmPayment() turns a verified payment into a paid order via Orders.fulfill().

import { Eps } from './eps';

export interface PaymentOrder {
  id: string;
  /** Our unique id for this payment attempt, sent to the gateway and used to verify it. */
  transactionId: string;
  total: number;
  name: string;
  email: string;
  phone: string;
  ip: string | null;
  items: { courseId: number; title: string; price: number }[];
}

export interface PaymentResult {
  /** Only 'paid' is final from a status check; failures come from the gateway's fail/cancel return. */
  status: 'paid' | 'unpaid';
  amount: number;
  reference: string | null;
  method: string | null;
}

export interface PaymentGateway {
  name: string;
  /** Start a payment and return the gateway page to send the buyer to. */
  start(order: PaymentOrder, urls: { success: string; fail: string; cancel: string }): Promise<string>;
  verify(transactionId: string): Promise<PaymentResult>;
}

/** The active gateway, or null when EPS isn't configured (orders then wait for an admin to mark them paid). */
export function paymentGateway(env: Env): PaymentGateway | null {
  return Eps.fromEnv(env);
}

/** Merchant transaction ids must be unique and at least 10 digits. */
export const newTransactionId = () => `${Date.now()}${String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1000).padStart(3, '0')}`;
