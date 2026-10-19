import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { unzipSync } from 'fflate';

const base = (process.env.ARVONO_API_URL || 'http://72.62.255.120:20977').replace(/\/$/, '');
const sample = JSON.parse(await readFile(new URL('../examples/rest/shipment.json', import.meta.url), 'utf8'));
const shipments = JSON.parse(await readFile(new URL('../examples/rest/shipments.json', import.meta.url), 'utf8'));
const directory = new URL('../tmp/pdfs/rest-api/', import.meta.url);
await mkdir(directory, { recursive: true });
const report = { baseUrl: base, verifiedAt: new Date().toISOString(), checks: [] };
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(30_000) });
const post = (path, payload) => request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
async function inspectPdf(bytes, expectedPages, expectedSize, identifiers) {
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, expectedPages);
    let text = '';
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      assert.ok(Math.abs(page.view[2] - page.view[0] - expectedSize[0]) < 0.00001);
      assert.ok(Math.abs(page.view[3] - page.view[1] - expectedSize[1]) < 0.00001);
      text += (await page.getTextContent()).items.filter((item) => 'str' in item).map((item) => item.str).join('');
    }
    for (const identifier of identifiers) assert.ok(text.includes(identifier), `Missing parcel ID ${identifier}`);
    return { pages: pdf.numPages, pageSizePt: expectedSize };
  } finally { await task.destroy(); }
}
async function checkPdf(path, payload, filename, count, size, identifiers) {
  const response = await post(path, payload);
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}: ${await response.text()}`);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(new URL(filename, directory), bytes);
  const details = await inspectPdf(bytes, count, size, identifiers);
  const check = { endpoint: path, status: response.status, type: 'application/pdf', ...details };
  report.checks.push(check); console.log(JSON.stringify(check));
}

assert.equal((await request('/')).status, 200);
await checkPdf('/generate', sample, 'single-label.pdf', 1, [216, 216], [sample.parcelId]);
await checkPdf('/batch', shipments, 'individual-label-pages.pdf', 10, [216, 216], shipments.map((item) => item.parcelId));
const a4Size = [210 * 72 / 25.4, 297 * 72 / 25.4];
await checkPdf('/a4', shipments, 'a4-ten-labels.pdf', 2, a4Size, shipments.map((item) => item.parcelId));
await checkPdf('/generate', { ...sample, size: { width: 4, height: 6, unit: 'in' } }, 'individual-4x6.pdf', 1, [288, 432], [sample.parcelId]);
await checkPdf('/generate', { ...sample, name: 'পরীক্ষামূলক গ্রাহক', address: 'বাড়ি ১২, দ্বিতীয় তলা, নতুন ভবন, রোড ৭, শান্তিনগর, প্রধান গেটের সামনে, ঢাকা ১২১৭, বাংলাদেশ। বিকেলে পৌঁছানোর আগে ফোন করুন।' }, 'long-bangla-label.pdf', 1, [216, 216], [sample.parcelId]);
const zipped = await post('/a4?output=zip', shipments);
if (zipped.status !== 200) throw new Error(`A4 ZIP: HTTP ${zipped.status}: ${await zipped.text()}`);
assert.equal(zipped.headers.get('content-type'), 'application/zip');
const zipBytes = new Uint8Array(await zipped.arrayBuffer());
await writeFile(new URL('a4-separate-sheets.zip', directory), zipBytes);
const files = unzipSync(zipBytes);
assert.equal(Object.keys(files).length, 2);
for (const [index, name] of Object.keys(files).entries()) assert.match(name, new RegExp(`^arvono-a4-10-labels-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}-BDT-[0-9a-f]{8}-sheet-00${index + 1}-of-002\\.pdf$`));
for (const [index, [filename, bytes]] of Object.entries(files).entries()) {
  await writeFile(new URL(filename, directory), bytes);
  await inspectPdf(bytes, 1, a4Size, shipments.slice(index * 6, index * 6 + 6).map((item) => item.parcelId));
}
const zipCheck = { endpoint: '/a4?output=zip', status: 200, type: 'application/zip', files: Object.keys(files) };
report.checks.push(zipCheck); console.log(JSON.stringify(zipCheck));
const invalid = await post('/generate', { ...sample, phone: 1700000000 });
assert.equal(invalid.status, 400); assert.match(invalid.headers.get('content-type'), /application\/json/);
assert.equal((await invalid.json()).field, 'phone');
report.checks.push({ endpoint: '/generate', invalidInputStatus: 400, invalidField: 'phone' });
await writeFile(new URL('report.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(`Verified ${report.checks.length} REST checks against ${base}. PDFs are in tmp/pdfs/rest-api/.`);
