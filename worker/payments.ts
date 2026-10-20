// Payment gateways plug in here. EPS (Easy Payment System) will be added once its API details are in.
//
// A gateway turns an order into a URL the buyer is sent to. When the gateway reports success
// (callback or webhook route in index.ts), call `Orders.fulfill(orderId, gateway.name, reference)`:
// that marks the order paid, enrolls the buyer and emails them their course link. It is idempotent.

export interface PaymentOrder {
  id: string;
  total: number;
  name: string;
  email: string;
  phone: string;
  items: { courseId: number; title: string; price: number }[];
}

export interface PaymentGateway {
  name: string;
  /** Start a payment and return the gateway page to send the buyer to. */
  start(order: PaymentOrder, urls: { success: string; fail: string; cancel: string }): Promise<string>;
}

/** The active gateway, or null while none is configured (orders then wait for an admin to mark them paid). */
export function paymentGateway(_env: Env): PaymentGateway | null {
  return null;
}
