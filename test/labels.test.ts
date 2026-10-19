import { beforeAll, expect, mock, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import type { ArvonoOrder } from '../shared/api';

// Test the PDFKit build the browser actually runs, not the Node one Bun would pick.
mock.module('pdfkit', () => import('../node_modules/pdfkit/js/pdfkit.browser.mjs'));
const { orderShipment, renderOrders } = await import('../src/labels/download');
const { generateA4Sheets, generateLabels } = await import('../src/labels/label');

beforeAll(() => {
  // The browser renderer fetches /fonts/*.ttf; serve them from public/.
  globalThis.fetch = (async (input: string) => new Response(await readFile(`public${input}`))) as unknown as typeof fetch;
});

const order = (id: number, extra: Partial<ArvonoOrder> = {}): ArvonoOrder => ({
  orderId: id, orderName: `#${1000 + id}`, consignmentId: `30947900${id}`, codAmount: 849, labelStatus: 'reserved',
  customer: { name: 'রাকিব হাসান', phone: '01780282878' },
  shippingAddress: { address: 'বাড়ি ১২, রোড ৭, শান্তিনগর', city: 'Dhaka', zip: '1217' }, ...extra,
});
const pages = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf).match(/\/Type \/Page\b/g)?.length ?? 0;

test('maps an ARVONO order to the label fields', () => {
  expect(orderShipment(order(1, { shippingAddress: { address: 'House 1, Dhaka', city: 'Dhaka', zip: '1217' } }))).toEqual({
    name: 'রাকিব হাসান', phone: '01780282878', address: 'House 1, Dhaka, 1217', cod: 849, parcelId: '309479001',
  });
});

test('renders one 3 × 3 inch label per page', async () => {
  const pdf = await generateLabels([1, 2, 3].map((id) => orderShipment(order(id))));
  expect(pages(pdf)).toBe(3);
  expect(new TextDecoder('latin1').decode(pdf)).toContain('/MediaBox [0 0 216 216]');
});

test('places six labels on each A4 sheet', async () => {
  const shipments = Array.from({ length: 10 }, (_, index) => orderShipment(order(index + 1)));
  const [pdf] = await generateA4Sheets(shipments);
  expect(pages(pdf!)).toBe(2);
  const sheets = await generateA4Sheets(shipments, { split: true });
  expect(sheets.map(pages)).toEqual([1, 1]);
});

test('A4 split download is a ZIP with one PDF per sheet', async () => {
  const orders = Array.from({ length: 7 }, (_, index) => order(index + 1));
  const { blob, filename } = await renderOrders(orders, { format: 'a4', splitSheets: true, cutMarks: true }, { id: 'abcdef12', reprint: true });
  expect(filename).toMatch(/^arvono-a4-7-labels-reprint-.*-abcdef12\.zip$/);
  expect(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer())))).toHaveLength(2);
});

test('thermal presets set the page size', async () => {
  const { blob } = await renderOrders([order(1)], { format: 'thermal', preset: '100x150mm', dpi: 300 }, { id: 'x', reprint: false });
  const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  expect(text).toMatch(/\/MediaBox \[0 0 283\.46\d* 425\.19\d*\]/);
});
