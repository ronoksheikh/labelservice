import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import { writeFile } from 'node:fs/promises';
import { importPdf } from '../dist/import.js';
import { banglaSpans } from '../dist/bangla.js';
import { brokenBanglaOrder, joinPdfText } from '../dist/pdf-text.js';
import { combineReadings } from '../dist/ocr-words.js';

const text = (str, x, y, width = 20) => ({ str, transform: [8, 0, 0, 8, x, y], width, height: 8 });

test('joining keeps dependent vowel signs and conjuncts together without rewriting valid Bangla', () => {
  assert.equal(joinPdfText([text('ক', 80, 100, 6), text('ি', 90, 100, 2)]), 'কি');
  assert.equal(joinPdfText([text('ক্', 80, 100, 6), text('ষ', 90, 100, 6)]), 'ক্ষ');
  for (const value of ['কী', 'কো', 'বাড়ি', 'কর্মী', 'প্রিয়', 'সম্মান', 'রাকিব হাসান']) assert.equal(brokenBanglaOrder(value), false, value);
  assert.equal(brokenBanglaOrder('চুিরহা'), true);
  assert.equal(brokenBanglaOrder('ির'), true);
});

test('recovery targets damaged recipient runs and leaves identifiers, phone, amount, note and good Bangla alone', () => {
  const row = (key, value, y) => [text(key, 6, y), text(value, 80, y)];
  const items = [...row('SF-ID', '00\x00123', 170), ...row('PHONE', '01\x007', 155),
    ...row('NAME', 'রা\x00িব', 140), ...row('ADDRESS', 'শান্তিনগর', 125),
    ...row('NOTE', 'বা\x00', 110), ...row('CASH ON DELIVERY', '\x00859', 95)];
  const spans = banglaSpans(items);
  assert.equal(spans.length, 1); assert.equal(spans[0].field, 'name'); assert.equal(spans[0].items[0].str, 'রা\x00িব');
});

test('long phrases retain uncertain proper nouns and merge the clearest word from each scale', () => {
  const word = (text, confidence, x0, x1) => ({ text, confidence, bbox: { x0, x1, y0: 0, y1: 40 } });
  const result = combineReadings([
    { coverage: 1, words: [word('ইস্টার্ন', 76, 0, 90), word('মল্লিকার', 23, 100, 190), word('সামনে', 96, 200, 280)] },
    { coverage: 1, words: [word('ইস্টার্ন', 87, 0, 90), word('মন্লিকার', 12, 100, 190), word('সামনে', 95, 200, 280)] },
  ]);
  assert.deepEqual(result.words.map((word) => word.text), ['ইস্টার্ন', 'মল্লিকার', 'সামনে']);
  assert.ok(result.confidence >= 60);
});

test('a high-scoring partial reading cannot replace a complete address line', () => {
  const word = (text, confidence, x0, x1) => ({ text, confidence, bbox: { x0, x1, y0: 0, y1: 40 } });
  const result = combineReadings([
    { coverage: 0.5, words: [word('ঢাকা', 99, 200, 250)] },
    { coverage: 1, words: [word('শান্তিনগর', 75, 0, 120), word('ঢাকা', 90, 200, 250)] },
  ]);
  assert.deepEqual(result.words.map((word) => word.text), ['শান্তিনগর', 'ঢাকা']);
});

test('address recovery includes every continuation line and keeps punctuation in one phrase', () => {
  const source = [text('ADDRESS', 6, 120), text('রা\x00া', 80, 120), text(',', 110, 120, 2), text('নতুন', 116, 120),
    text('ভবন', 80, 105), text('ঢাকা', 80, 90), text('১২১৭', 110, 90),
    text('AREA', 6, 75), text('Dhaka City', 80, 75), text('NOTE', 6, 60), text('Handle with care', 80, 60)];
  const spans = banglaSpans(source);
  assert.equal(spans.length, 3);
  assert.deepEqual(spans.map((span) => span.items[0].transform[5]), [120, 105, 90]);
  assert.ok(spans[0].items.some((item) => item.str === ','));
  assert.ok(spans.every((span) => span.field === 'address'));
});

async function brokenMappingPdf() {
  const doc = new PDFDocument({ compress: false, size: [250, 220], margin: 0 });
  const chunks = [];
  const complete = new Promise((resolve, reject) => { doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.registerFont('bangla', 'assets/fonts/AnekBangla-Regular.ttf');
  const rows = [['SF-ID', '000123456'], ['NAME', 'Test Recipient'], ['PHONE', '01700000000'], ['ADDRESS', 'ঢাকা'], ['CASH ON DELIVERY', '1,599']];
  rows.forEach(([key, value], index) => {
    const y = 20 + index * 30;
    doc.font('Helvetica').fontSize(8).text(key, 6, y, { lineBreak: false });
    doc.font(key === 'ADDRESS' ? 'bangla' : 'Helvetica').fontSize(10).text(value, 100, y, { lineBreak: false });
  });
  doc.end();
  const original = (await complete).toString('latin1');
  assert.match(original, /<09a2>/i, 'Fixture must contain the Unicode mapping for ঢ.');
  // Preserve glyph artwork and every PDF byte offset while simulating the courier's missing text map.
  return Buffer.from(original.replace(/<09a2>/gi, '<0000>'), 'latin1');
}

test('real local OCR fixes a missing Bangla mapping and passes automatically while preserving IDs and COD', async () => {
  const result = await importPdf(await brokenMappingPdf());
  assert.equal(result.pageCount, 1);
  const label = result.labels[0];
  assert.equal(label.fields.address, 'ঢাকা');
  assert.equal(label.fields.parcelId, '000123456'); assert.equal(label.fields.phone, '01700000000');
  assert.equal(label.fields.cod, 1599); assert.equal(label.fields.name, 'Test Recipient');
  assert.equal(label.recovery.length, 1); assert.equal(label.recovery[0].field, 'address');
  assert.equal(label.recovery[0].method, 'local-ocr'); assert.ok(label.recovery[0].original.includes('�'));
  assert.deepEqual(label.issues, []);
  await writeFile('tmp/pdfs/bangla-ocr-source.pdf', await brokenMappingPdf());
});

test('real OCR retains all four wrapped Bangla address lines, house and postal numbers', async () => {
  const doc = new PDFDocument({ compress: false, size: [300, 280], margin: 0 });
  const chunks = [];
  const complete = new Promise((resolve, reject) => { doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.registerFont('bangla', 'assets/fonts/AnekBangla-Regular.ttf');
  const field = (key, value, y, font = 'Helvetica') => {
    doc.font('Helvetica').fontSize(8).text(key, 6, y, { lineBreak: false });
    doc.font(font).fontSize(10).text(value, 85, y, { lineBreak: false });
  };
  field('SF-ID', '000123456', 20); field('NAME', 'Test Recipient', 45); field('PHONE', '01700000000', 70);
  field('ADDRESS', 'বাড়ি ১২, শান্তিনগর', 95, 'bangla');
  for (const [index, value] of ['দ্বিতীয় তলা, নতুন ভবন', 'প্রধান গেটের সামনে, ঢাকা ১২১৭', 'বাংলাদেশ'].entries()) {
    doc.font('bangla').fontSize(10).text(value, 85, 115 + index * 20, { lineBreak: false });
  }
  field('AREA', 'Dhaka City', 185); field('NOTE', 'Handle with care', 210); field('CASH ON DELIVERY', '849', 240);
  doc.end();
  const original = (await complete).toString('latin1');
  assert.match(original, /<09ac>/i);
  const broken = Buffer.from(original.replace(/<09ac>/gi, '<0000>'), 'latin1');
  const result = await importPdf(broken);
  const label = result.labels[0];
  for (const part of ['শান্তিনগর', 'নতুন ভবন', 'ঢাকা', 'বাংলাদেশ', 'Dhaka City', '১২', '১২১৭']) assert.ok(label.fields.address.includes(part), `${part}: ${label.fields.address}`);
  assert.equal(label.fields.parcelId, '000123456'); assert.equal(label.fields.phone, '01700000000'); assert.equal(label.fields.cod, 849);
  assert.deepEqual(label.issues, []); assert.ok(!label.fields.address.includes('�'));
  await writeFile('tmp/pdfs/bangla-long-source.pdf', broken);
});
