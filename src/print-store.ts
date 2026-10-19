import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PrintOptions } from './download.js';

export interface FulfillmentOrder {
  orderId: number; orderName: string; consignmentId: string; invoice?: string;
  customer: { name: string; phone: string; alternativePhone?: string | null };
  shippingAddress: { address: string; city?: string; zip?: string; country?: string };
  codAmount: number; bookedDate?: string; labelStatus: string; printCount?: number;
  items?: { title: string; variant?: string; quantity: number }[];
}
export interface PrintJob {
  id: string; createdAt: string; updatedAt: string;
  status: 'preparing' | 'ready' | 'confirmation_pending' | 'release_pending' | 'printed' | 'partial' | 'released' | 'failed';
  request: { orderIds: number[]; mode: 'pending' | 'reprint'; reason: string; upTo: string; options: PrintOptions };
  signature: string; claimKey: string; confirmKey: string; releaseKey: string;
  upstreamJobId?: string; expiresAt?: string; orders: FulfillmentOrder[];
  filename?: string; type?: string; error?: string;
  confirmationIds?: number[]; result?: unknown;
  events: { at: string; action: string; reason?: string }[];
}
export class PrintStore {
  private locks = new Map<string, Promise<unknown>>();
  readonly directory: string;
  constructor(directory: string) { this.directory = resolve(directory); }
  async locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    this.locks.set(id, current);
    try { return await current; } finally { if (this.locks.get(id) === current) this.locks.delete(id); }
  }
  async get(id: string): Promise<PrintJob | undefined> {
    try { return JSON.parse(await readFile(join(this.directory, `${id}.json`), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
  async save(job: PrintJob) {
    await mkdir(this.directory, { recursive: true });
    job.updatedAt = new Date().toISOString();
    const target = join(this.directory, `${job.id}.json`);
    await writeFile(`${target}.tmp`, JSON.stringify(job), { mode: 0o600 });
    await rename(`${target}.tmp`, target);
  }
  async file(id: string) { return readFile(join(this.directory, `${id}.download`)); }
  async saveFile(id: string, bytes: Buffer) {
    await mkdir(this.directory, { recursive: true });
    const target = join(this.directory, `${id}.download`);
    await writeFile(`${target}.tmp`, bytes, { mode: 0o600 });
    await rename(`${target}.tmp`, target);
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const files = (await readdir(this.directory)).filter((file) => /^[0-9a-f-]{36}\.json$/.test(file));
    const jobs = await Promise.all(files.map((file) => this.get(file.slice(0, -5))));
    return jobs.filter((job): job is PrintJob => !!job).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
export function publicJob(job: PrintJob) {
  return { id: job.id, createdAt: job.createdAt, updatedAt: job.updatedAt, status: job.status, mode: job.request.mode,
    reason: job.request.reason, options: job.request.options, requestedCount: job.request.orderIds.length,
    orders: job.orders, filename: job.filename, type: job.type, error: job.error,
    confirmationIds: job.confirmationIds, expiresAt: job.expiresAt, result: job.result, events: job.events };
}
