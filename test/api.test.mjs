import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildApp } from '../dist/routes.js';
import { inflateSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const app = buildApp();
after(() => app.close());
await mkdir('tmp/pdfs', { recursive: true });
const sample = { name: 'Rakib', phone: '01780282878', address: 'Jibonnagar, Chuadanga, Bangladesh', cod: 849, parcelId: '309479004' };
const post = (url, payload) => app.inject({ method: 'POST', url, payload });
const pageCount = (pdf) => [...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length;
const a4Shipments = (count) => Array.from({ length: count }, (_, index) => ({ ...sample, parcelId: String(309479000 + index) }));
// Inspect the actual vector rectangles and translation matrices in the generated PDF.
function contentStreams(pdf) {
  return [...pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'));
}
function labelPositions(pdf) {
  return contentStreams(pdf).flatMap((content) => {
    return [...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) cm\s+0 0 216 216 re/g)]
      .map((rectangle) => ({ x: Number(rectangle[1]), y: Number(rectangle[2]) }));
  });
}

test('single label: exact square page, embedded fonts, vector barcode, no blank page', async () => {
  const response = await post('/generate', sample);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.rawPayload.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pageCount(response.rawPayload), 1);
  const pdf = response.rawPayload.toString('latin1');
  assert.match(pdf, /\/MediaBox \[0 0 216 216\]/);
  assert.match(pdf, /\/FontFile2/);
  assert.match(pdf, /\+InstrumentSerif-Regular\b/);
  assert.match(pdf, /\+AnekBangla-SemiBold\b/);
  assert.doesNotMatch(pdf, /NotoSansBengali/);
  assert.doesNotMatch(pdf, /\/Subtype \/Image\b/);
});

test('thermal defaults to exact 4x6 pages and black-on-white vector artwork', async () => {
  const response = await post('/thermal', sample);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(pageCount(response.rawPayload), 1);
  const pdf = response.rawPayload.toString('latin1');
  assert.match(pdf, /\/MediaBox \[0 0 288 432\]/);
  assert.match(pdf, /\+InstrumentSerif-Regular\b/);
  assert.doesNotMatch(pdf, /\/Subtype \/Image\b/);
  const colors = contentStreams(response.rawPayload).flatMap((stream) => [...stream.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) (?:scn|SCN)$/gm)]);
  assert.ok(colors.length > 10);
  assert.ok(colors.some((color) => color.slice(1, 4).every((component) => Number(component) === 1)));
  assert.ok(colors.every((color) => color.slice(1, 4).every((component) => Number(component) === 0) || color.slice(1, 4).every((component) => Number(component) === 1)));
  const premium = await post('/generate', sample);
  const premiumColors = contentStreams(premium.rawPayload).flatMap((stream) => [...stream.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) scn$/gm)]);
  assert.ok(premiumColors.some((color) => color.slice(1, 4).every((component) => Math.abs(Number(component) - 17 / 255) < 0.00000001)));
});

test('thermal preset discovery and every advertised size render at the exact physical dimensions', async () => {
  const metadata = await app.inject({ method: 'GET', url: '/thermal/presets' });
  assert.equal(metadata.statusCode, 200);
  const { presets, defaultPreset, supportedDpi } = metadata.json();
  assert.equal(defaultPreset, '4x6');
  assert.deepEqual(supportedDpi, [203, 300]);
  assert.ok(presets.length >= 6);
  for (const { id, size } of presets) {
    const response = await post('/thermal?preset=' + id, sample);
    assert.equal(response.statusCode, 200, `${id}: ${response.body}`);
    const box = response.rawPayload.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(box);
    const factor = size.unit === 'in' ? 72 : 72 / 25.4;
    assert.ok(Math.abs(Number(box[1]) - size.width * factor) < 0.00001);
    assert.ok(Math.abs(Number(box[2]) - size.height * factor) < 0.00001);
    await writeFile(`tmp/pdfs/thermal-${id}.pdf`, response.rawPayload);
  }
});

test('thermal barcode bars align to whole printer dots at 203 and 300 dpi', async () => {
  for (const dpi of [203, 300]) {
    const response = await post('/thermal?preset=3x3&dpi=' + dpi, sample);
    assert.equal(response.statusCode, 200);
    const bars = contentStreams(response.rawPayload).flatMap((content) =>
      [...content.matchAll(/^([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re$/gm)])
      .map((rect) => rect.slice(1).map(Number))
      .filter(([, , width, height]) => width < 10 && height >= 18 && height < 50);
    assert.ok(bars.length > 20);
    for (const bar of bars) {
      for (const measurement of bar) {
        const dots = measurement * dpi / 72;
        assert.ok(Math.abs(dots - Math.round(dots)) < 0.00001, JSON.stringify({ dpi, bar }));
      }
      assert.ok(bar[2] * dpi / 72 >= 2 - 0.00001);
      assert.ok(bar[2] >= 72 * 2 / 203 - 0.00001);
    }
    await writeFile(`tmp/pdfs/thermal-dpi-${dpi}.pdf`, response.rawPayload);
  }
});

test('thermal batches keep one stock size, inherit custom dimensions, and support 500 labels', async () => {
  const response = await post('/thermal/batch?preset=3x3', a4Shipments(500));
  assert.equal(response.statusCode, 200);
  assert.equal(pageCount(response.rawPayload), 500);
  const custom = await post('/thermal/batch', [
    { ...sample, size: { width: 80, height: 120, unit: 'mm' } }, sample,
  ]);
  assert.equal(custom.statusCode, 200);
  const boxes = [...custom.rawPayload.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
  assert.equal(boxes.length, 2);
  for (const box of boxes) {
    assert.ok(Math.abs(Number(box[1]) * 25.4 / 72 - 80) < 0.00001);
    assert.ok(Math.abs(Number(box[2]) * 25.4 / 72 - 120) < 0.00001);
  }
  await writeFile('tmp/pdfs/thermal-custom-batch.pdf', custom.rawPayload);
});

test('thermal preserves Bangla shaping and rejects bad options, stock mismatches and fit errors', async () => {
  const bangla = await post('/thermal', { ...sample, name: 'রাকিব হাসান', phone: '০১৭৮০২৮২৮৭৮', address: 'বাড়ি ১২, শান্তিনগর, ঢাকা, বাংলাদেশ', parcelId: '000309479004' });
  assert.equal(bangla.statusCode, 200, bangla.body);
  assert.match(bangla.rawPayload.toString('latin1'), /\+AnekBangla-Regular\b/);
  assert.match(bangla.rawPayload.toString('latin1'), /\+AnekBangla-SemiBold\b/);
  await writeFile('tmp/pdfs/thermal-bangla.pdf', bangla.rawPayload);
  for (const query of ['preset=invalid', 'preset=__proto__', 'dpi=600', 'dpi=203&dpi=300', 'preset=3x3&preset=4x6']) {
    assert.equal((await post('/thermal?' + query, sample)).statusCode, 400, query);
  }
  const conflict = await post('/thermal?preset=4x6', { ...sample, size: { width: 3, height: 3, unit: 'in' } });
  assert.equal(conflict.statusCode, 400);
  assert.equal(conflict.json().field, 'size');
  const mixed = await post('/thermal/batch', [sample, { ...sample, size: { width: 3, height: 3, unit: 'in' } }]);
  assert.equal(mixed.statusCode, 400);
  assert.equal(mixed.json().labelIndex, 1);
  assert.equal((await post('/thermal/batch', [])).statusCode, 400);
  assert.equal((await post('/thermal?preset=58x100mm&dpi=300', { ...sample, parcelId: 'A'.repeat(18) })).statusCode, 422);
  const long = await post('/thermal/batch?preset=3x3', [sample, { ...sample, address: 'A very long delivery address. '.repeat(45) }]);
  assert.equal(long.statusCode, 200);
  assert.equal(pageCount(long.rawPayload), 2);
  await writeFile('tmp/pdfs/thermal-long-address.pdf', long.rawPayload);
});

test('batch supports mixed dimensions in inches and millimeters', async () => {
  const response = await post('/batch', [sample,
    { ...sample, size: { width: 4, height: 3, unit: 'in' } },
    { ...sample, size: { width: 100, height: 75, unit: 'mm' } },
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(pageCount(response.rawPayload), 3);
  assert.match(response.rawPayload.toString('latin1'), /\/MediaBox \[0 0 288 216\]/);
  await writeFile('tmp/pdfs/mixed-sizes.pdf', response.rawPayload);
});

test('Bangla, mixed language, leading zeros, multiline addresses and conjuncts', async () => {
  const response = await post('/generate', {
    ...sample, name: 'রাকিব হাসান', phone: '০১৭৮০২৮২৮৭৮', parcelId: '000309479004',
    address: 'বাড়ি ১২, শান্তিনগর, Dhaka 1217\nজীবননগর, চুয়াডাঙ্গা, বাংলাদেশ',
    size: { width: 4, height: 4, unit: 'in' },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(pageCount(response.rawPayload), 1);
  assert.match(response.rawPayload.toString('latin1'), /\+AnekBangla-Regular\b/);
  assert.match(response.rawPayload.toString('latin1'), /\+AnekBangla-SemiBold\b/);
  await writeFile('tmp/pdfs/bangla.pdf', response.rawPayload);
  const english = await post('/generate', { ...sample, parcelId: '000309479004' });
  assert.equal(english.statusCode, 200);
  await writeFile('tmp/pdfs/leading-zeros.pdf', english.rawPayload);
});

test('long addresses wrap with no extra pages', async () => {
  const response = await post('/generate', { ...sample,
    address: 'Apartment 4B, House 12, Road 7, Sector 10, Uttara Model Town, Dhaka 1230, Bangladesh',
    size: { width: 4, height: 4, unit: 'in' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(pageCount(response.rawPayload), 1);
  await writeFile('tmp/pdfs/long-address.pdf', response.rawPayload);
});

test('compact square wrapping, Bangla square and narrow custom dimensions fit', async () => {
  for (const [filename, changes] of [
    ['wrapped-square', { address: 'House 12, Road 7, Sector 10, Uttara, Dhaka 1230, Bangladesh' }],
    ['bangla-square', { name: 'রাকিব হাসান', address: 'জীবননগর, চুয়াডাঙ্গা, বাংলাদেশ' }],
    ['narrow', { size: { width: 2, height: 4, unit: 'in' } }],
    ['zero-cod', { cod: 0 }],
    ['decimal-cod', { cod: 849.25 }],
  ]) {
    const response = await post('/generate', { ...sample, ...changes });
    assert.equal(response.statusCode, 200, `${filename}: ${response.body}`);
    assert.equal(pageCount(response.rawPayload), 1);
    await writeFile(`tmp/pdfs/${filename}.pdf`, response.rawPayload);
  }
});

test('500 labels produce exactly 500 pages through the batch endpoint', { timeout: 60_000 }, async () => {
  const shipments = Array.from({ length: 500 }, (_, index) => ({ ...sample, parcelId: String(309479000 + index) }));
  const started = performance.now();
  const response = await post('/batch', shipments);
  assert.equal(response.statusCode, 200);
  assert.equal(pageCount(response.rawPayload), 500);
  await writeFile('tmp/pdfs/batch-500.pdf', response.rawPayload);
  console.log(`500-label batch: ${Math.round(performance.now() - started)} ms, ${response.rawPayload.length} bytes`);
});

test('strict input types preserve identifiers and reject malformed input', async () => {
  for (const changes of [
    { name: '' }, { phone: 1780282878 }, { parcelId: 309479004 }, { parcelId: 'বাংলা' },
    { parcelId: 'abc\n123' }, { cod: -1 }, { cod: '849' }, { cod: 1.001 }, { cod: null },
    { size: { width: 0, height: 3, unit: 'in' } },
    { size: { width: 3, height: 3, unit: 'px' } },
    { size: { width: 3, unit: 'in' } },
    { size: { width: 13, height: 3, unit: 'in' } },
  ]) {
    const response = await post('/generate', { ...sample, ...changes });
    assert.equal(response.statusCode, 400, JSON.stringify(changes));
    assert.equal(response.json().error, 'INVALID_INPUT');
  }
  for (const body of [null, [], {}, 'text']) {
    const response = await app.inject({ method: 'POST', url: '/generate', headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) });
    assert.equal(response.statusCode, 400);
  }
  const malformed = await app.inject({ method: 'POST', url: '/generate', headers: { 'content-type': 'application/json' }, payload: '{oops' });
  assert.equal(malformed.statusCode, 400);
});

test('recipient text automatically shrinks, preserving full content and fixed barcode geometry', async () => {
  const regular = await post('/generate', sample);
  const bars = (pdf) => contentStreams(pdf).flatMap((content) =>
    [...content.matchAll(/^([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re$/gm)])
    .map((rectangle) => rectangle.slice(1).map(Number))
    .filter(([, , width, height]) => width < 10 && height >= 18 && height < 50);
  const cases = [
    { ...sample, address: 'A very long delivery address. '.repeat(45) + 'FINAL DESTINATION' },
    { ...sample, name: 'Long Recipient '.repeat(10).trim(), phone: '0123456789'.repeat(4), address: 'x'.repeat(1600) },
    { ...sample, name: 'রাকিব হাসান', address: 'বাড়ি ১২, সড়ক ৭, শান্তিনগর, ঢাকা, বাংলাদেশ। '.repeat(30) + 'শেষ ঠিকানা' },
    { ...sample, address: Array(90).fill('Delivery place').join('\n') },
  ];
  for (const [index, shipment] of cases.entries()) {
    const response = await post('/generate', shipment);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(pageCount(response.rawPayload), 1);
    assert.match(response.rawPayload.toString('latin1'), /\/MediaBox \[0 0 216 216\]/);
    assert.deepEqual(bars(response.rawPayload), bars(regular.rawPayload));
    const task = getDocument({ data: new Uint8Array(response.rawPayload), useSystemFonts: false, verbosity: 0 });
    try {
      const pdf = await task.promise;
      const { items, styles } = await (await pdf.getPage(1)).getTextContent();
      const text = items.filter((item) => 'str' in item && item.str.trim());
      const normalize = (value) => value.replace(/\s+/gu, '').normalize('NFC');
      const recipient = text.slice(text.findIndex((item) => normalize(item.str) === 'SHIPTO') + 1,
        text.findIndex((item) => normalize(item.str) === 'CASHONDELIVERY'));
      assert.ok(recipient.length > 2);
      assert.ok(recipient.some((item) => item.height < 7), 'shrinks below the old minimum');
      // Rewrapping must keep the entire recipient, including the final address words.
      const actual = normalize(recipient.map((item) => item.str).join(''));
      const expected = normalize(shipment.name + shipment.phone + shipment.address);
      if (/[\u0980-\u09ff]/u.test(expected)) {
        // Shaped Bangla extracts in glyph order; count every decomposed character
        // while visual QA checks the placement of vowel signs and conjuncts.
        assert.deepEqual([...actual.normalize('NFD')].sort(), [...expected.normalize('NFD')].sort());
      } else assert.equal(actual, expected);
      const payment = text.find((item) => normalize(item.str) === 'CASHONDELIVERY');
      const divider = 216 - payment.transform[5] - styles[payment.fontName].ascent * payment.height - 8;
      for (const item of recipient) {
        const bottom = 216 - item.transform[5] - styles[item.fontName].descent * item.height;
        assert.ok(item.transform[4] >= 16 - 0.01);
        assert.ok(item.transform[4] + item.width <= 200 + 0.01);
        assert.ok(bottom <= divider - 4.9, `recipient must stay above the divider: ${bottom}, ${divider}`);
      }
    } finally { await task.destroy(); }
    await writeFile(`tmp/pdfs/auto-fit-${index}.pdf`, response.rawPayload);
  }
  const batch = await post('/batch', [sample, ...cases]);
  assert.equal(batch.statusCode, 200);
  assert.equal(pageCount(batch.rawPayload), 5);
});

test('unfittable barcodes return clear JSON errors, including batch indices', async () => {
  const barcode = await post('/generate', { ...sample, parcelId: 'A'.repeat(80) });
  assert.equal(barcode.statusCode, 422);
  assert.equal(barcode.json().error, 'BARCODE_DOES_NOT_FIT');
  const batch = await post('/batch', [sample, { ...sample, parcelId: 'A'.repeat(80) }]);
  assert.equal(batch.statusCode, 422);
  assert.equal(batch.json().labelIndex, 1);
  assert.match(batch.headers['content-type'], /application\/json/);
  const invalid = await post('/batch', [sample, { ...sample, phone: 123 }]);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().labelIndex, 1);
  for (const payload of [[], {}, Array(1001).fill(sample)]) {
    assert.equal((await post('/batch', payload)).statusCode, 400);
  }
});

test('A4 packs ten unscaled 3-inch labels onto two exact A4 pages', async () => {
  const response = await post('/a4', a4Shipments(10));
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(pageCount(response.rawPayload), 2);
  const boxes = [...response.rawPayload.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
  assert.equal(boxes.length, 2);
  for (const box of boxes) {
    assert.ok(Math.abs(Number(box[1]) * 25.4 / 72 - 210) < 0.00001);
    assert.ok(Math.abs(Number(box[2]) * 25.4 / 72 - 297) < 0.00001);
  }
  const positions = labelPositions(response.rawPayload);
  assert.equal(positions.length, 10);
  assert.ok(Math.abs(positions[0].x * 25.4 / 72 - 26.3) < 0.00001);
  assert.ok(Math.abs(positions[0].y * 25.4 / 72 - 29.2) < 0.00001);
  assert.ok(Math.abs((positions[1].x - positions[0].x - 216) * 25.4 / 72 - 5) < 0.00001);
  assert.ok(Math.abs((positions[2].y - positions[0].y - 216) * 25.4 / 72 - 5) < 0.00001);
  assert.deepEqual(positions[6], positions[0]);
  assert.deepEqual(positions[9], positions[3]);
  await writeFile('tmp/pdfs/a4-ten.pdf', response.rawPayload);
});

test('A4 handles exact page boundaries and a 500-label batch', async () => {
  for (const count of [1, 6, 7, 12, 13, 500]) {
    const response = await post('/a4', a4Shipments(count));
    assert.equal(response.statusCode, 200);
    assert.equal(pageCount(response.rawPayload), Math.ceil(count / 6));
    assert.equal(labelPositions(response.rawPayload).length, count);
  }
});

test('A4 ZIP contains one complete single-page PDF per sheet', async () => {
  const response = await post('/a4?output=zip', a4Shipments(10));
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers['content-type'], 'application/zip');
  assert.match(response.headers['content-disposition'], /attachment/);
  assert.equal(response.headers['cache-control'], 'no-store');
  const files = unzipSync(response.rawPayload);
  assert.equal(Object.keys(files).length, 2);
  for (const [index, name] of Object.keys(files).entries()) assert.match(name, new RegExp(`^arvono-a4-10-labels-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}-BDT-[0-9a-f]{8}-sheet-00${index + 1}-of-002\\.pdf$`));
  for (const [index, bytes] of Object.values(files).entries()) {
    const pdf = Buffer.from(bytes);
    assert.equal(pageCount(pdf), 1);
    assert.equal(labelPositions(pdf).length, index === 0 ? 6 : 4);
  }
  await writeFile('tmp/pdfs/a4-ten.zip', response.rawPayload);
});

test('A4 supports crop marks toggle, Bangla, leading zeros and equivalent mm sizing', async () => {
  const shipments = [
    { ...sample, name: 'রাকিব হাসান', address: 'জীবননগর, চুয়াডাঙ্গা, বাংলাদেশ',
      parcelId: '000309479004', size: { width: 76.2, height: 76.2, unit: 'mm' } },
    { ...sample, phone: '০১৭৮০২৮২৮৭৮', address: 'ঢাকা, বাংলাদেশ', parcelId: '000309479005' },
  ];
  const response = await post('/a4?cutMarks=false', shipments);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(pageCount(response.rawPayload), 1);
  assert.equal(labelPositions(response.rawPayload).length, 2);
  assert.match(response.rawPayload.toString('latin1'), /\+AnekBangla-Regular\b/);
  await writeFile('tmp/pdfs/a4-no-cut-marks.pdf', response.rawPayload);
});

test('A4 automatically shrinks long addresses for combined and separate sheets', async () => {
  const long = { ...sample, address: 'A very long delivery address. '.repeat(45) };
  const shipments = [...a4Shipments(6), long];
  const combined = await post('/a4', shipments);
  assert.equal(combined.statusCode, 200);
  assert.equal(pageCount(combined.rawPayload), 2);
  assert.equal(labelPositions(combined.rawPayload).length, 7);
  const separate = await post('/a4?output=zip', shipments);
  assert.equal(separate.statusCode, 200);
  const files = Object.values(unzipSync(separate.rawPayload)).map((bytes) => Buffer.from(bytes));
  assert.equal(files.length, 2);
  assert.deepEqual(files.map(pageCount), [1, 1]);
  assert.deepEqual(files.map((pdf) => labelPositions(pdf).length), [6, 1]);
  await writeFile('tmp/pdfs/a4-long-address.pdf', combined.rawPayload);
});

test('A4 rejects mismatched sizes, invalid options and bad content atomically', async () => {
  for (const query of ['output=invalid', 'cutMarks=1', 'output=pdf&output=zip', 'cutMarks=false&cutMarks=true']) {
    assert.equal((await post('/a4?' + query, [sample])).statusCode, 400, query);
  }
  for (const payload of [[], {}, Array(1001).fill(sample)]) {
    assert.equal((await post('/a4', payload)).statusCode, 400);
  }
  const sizeError = await post('/a4', [sample, { ...sample, size: { width: 4, height: 3, unit: 'in' } }]);
  assert.equal(sizeError.statusCode, 400);
  assert.equal(sizeError.json().labelIndex, 1);
  assert.equal(sizeError.json().field, 'size');
  const badBarcode = { ...sample, parcelId: 'A'.repeat(80) };
  for (const query of ['', '?output=zip']) {
    const response = await post('/a4' + query, [...a4Shipments(6), badBarcode]);
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().labelIndex, 6);
    assert.match(response.headers['content-type'], /application\/json/);
  }
});
