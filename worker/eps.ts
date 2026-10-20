// EPS (Easy Payment System) Merchant API, integration guide v5.
//   1. POST /Auth/GetToken                            x-hash = HMAC(userName)
//   2. POST /EPSEngine/InitializeEPS                  x-hash = HMAC(merchantTransactionId), Bearer token → RedirectURL
//   3. GET  /EPSEngine/CheckMerchantTransactionStatus x-hash = HMAC(merchantTransactionId), Bearer token → Status
// x-hash is Base64(HMAC-SHA512(key = UTF-8 hash key, message)).
// Credentials come from the Worker environment (wrangler.jsonc vars + secrets), never from code.

import type { PaymentGateway, PaymentOrder, PaymentResult } from './payments';

const API = { live: 'https://pgapi.eps.com.bd/v1', sandbox: 'https://sandboxpgapi.eps.com.bd/v1' } as const;

interface Config { mode: 'live' | 'sandbox'; merchantId: string; storeId: string; userName: string; password: string; hashKey: string }

export async function epsHash(hashKey: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(hashKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))));
}

// Tokens are reused within an isolate; EPS tokens last well over the 20 minutes we keep them.
let cached: { key: string; token: string; expires: number } | null = null;

export class Eps implements PaymentGateway {
  readonly name = 'eps';
  private constructor(private readonly config: Config) {}

  /** null when EPS_MODE is unset or a setting is missing. */
  static fromEnv(env: Env) {
    const value: string = env.EPS_MODE ?? '';
    const mode = value === 'sandbox' || value === 'live' ? value : null;
    if (!mode) return null;
    const config: Config = {
      mode,
      merchantId: env.EPS_MERCHANT_ID ?? '',
      storeId: env.EPS_STORE_ID ?? '',
      userName: env.EPS_USERNAME ?? '',
      password: env.EPS_PASSWORD ?? '',
      hashKey: env.EPS_HASH_KEY ?? '',
    };
    const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) {
      console.error(`EPS_MODE is "${mode}" but these EPS settings are missing: ${missing.join(', ')}`);
      return null;
    }
    return new Eps(config);
  }

  private hash(message: string) {
    return epsHash(this.config.hashKey, message);
  }

  private async call<T>(path: string, hashOf: string, init: { body?: unknown; token?: string } = {}): Promise<T> {
    const response = await fetch(`${API[this.config.mode]}${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hash': await this.hash(hashOf),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    const error = (data.ErrorMessage ?? data.errorMessage) as string | null | undefined;
    if (!response.ok || error) throw new Error(`EPS ${path.split('?')[0]} failed (HTTP ${response.status}): ${error || text.slice(0, 300)}`);
    return data as T;
  }

  private async token() {
    const key = `${this.config.mode}:${this.config.userName}`;
    if (cached && cached.key === key && cached.expires > Date.now()) return cached.token;
    const { token } = await this.call<{ token?: string }>('/Auth/GetToken', this.config.userName,
      { body: { userName: this.config.userName, password: this.config.password } });
    if (!token) throw new Error('EPS did not return a token.');
    cached = { key, token, expires: Date.now() + 20 * 60 * 1000 };
    return token;
  }

  async start(order: PaymentOrder, urls: { success: string; fail: string; cancel: string }) {
    const result = await this.call<{ TransactionId?: string; RedirectURL?: string }>('/EPSEngine/InitializeEPS', order.transactionId, {
      token: await this.token(),
      body: {
        merchantId: this.config.merchantId,
        storeId: this.config.storeId,
        CustomerOrderId: order.id,
        merchantTransactionId: order.transactionId,
        transactionTypeId: 1, // Web
        financialEntityId: 0,
        transitionStatusId: 0,
        totalAmount: order.total,
        ipAddress: order.ip ?? '',
        version: '1',
        successUrl: urls.success,
        failUrl: urls.fail,
        cancelUrl: urls.cancel,
        customerName: order.name,
        customerEmail: order.email,
        // EPS requires an address; we sell online courses and don't ask for one.
        customerAddress: 'Bangladesh',
        customerCity: 'Dhaka',
        customerState: 'Dhaka',
        customerPostcode: '1000',
        customerCountry: 'BD',
        customerPhone: order.phone,
        shippingMethod: 'NO',
        noOfItem: String(order.items.length),
        productName: order.items.map((item) => item.title).join(' + ').slice(0, 250),
        productProfile: 'non-physical-goods',
        productCategory: 'Online course',
        ProductList: order.items.map((item) => ({
          ProductName: item.title.slice(0, 250), NoOfItem: '1', ProductProfile: 'non-physical-goods',
          ProductCategory: 'Online course', ProductPrice: String(item.price),
        })),
      },
    });
    if (!result.RedirectURL) throw new Error('EPS did not return a payment page.');
    return result.RedirectURL;
  }

  async verify(transactionId: string): Promise<PaymentResult> {
    const result = await this.call<{ Status?: string; TotalAmount?: string; EPSTransactionId?: string; EpsTransactionId?: string; FinancialEntity?: string | null }>(
      `/EPSEngine/CheckMerchantTransactionStatus?merchantTransactionId=${encodeURIComponent(transactionId)}`, transactionId, { token: await this.token() });
    return {
      // EPS reports "Cancel" for payments that are still open, so anything but Success means "not paid yet".
      status: result.Status?.toLowerCase() === 'success' ? 'paid' : 'unpaid',
      amount: Number.parseFloat(result.TotalAmount ?? '0') || 0,
      reference: result.EPSTransactionId ?? result.EpsTransactionId ?? null,
      method: result.FinancialEntity ?? null,
    };
  }
}
