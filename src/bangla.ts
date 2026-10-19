import { createCanvas } from '@napi-rs/canvas';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brokenBanglaOrder, cleanPdfText, damagedText, fieldLines, joinPdfText, type PositionedText } from './pdf-text.js';
import { combineReadings, type OcrReading, type OcrWord } from './ocr-words.js';

interface RecoverySpan { field: 'name' | 'address'; items: PositionedText[]; context: PositionedText[] }
const needsRecovery = (text: string) => damagedText.test(text) || brokenBanglaOrder(text);

/** OCR only uncertain recipient runs. Identifiers, amounts and readable Latin runs are untouched. */
export function banglaSpans(items: PositionedText[]): RecoverySpan[] {
  const spans: RecoverySpan[] = [];
  const lines = fieldLines(items);
  const affected = new Set(lines.filter((line) => ['NAME', 'ADDRESS', 'AREA'].includes(line.key) && needsRecovery(line.value))
    .map((line) => line.key === 'NAME' ? 'name' : 'address'));
  for (const line of lines) {
    if (line.combined || !['NAME', 'ADDRESS', 'AREA'].includes(line.key)) continue;
    const field = line.key === 'NAME' ? 'name' : 'address';
    if (!affected.has(field)) continue;
    let run: PositionedText[] = [];
    const flush = () => {
      if (run.some((item) => /[\u0980-\u09ff]/u.test(item.str) || damagedText.test(item.str))) spans.push({ field, items: run, context: line.items });
      run = [];
    };
    for (const item of line.items) {
      // Commas and house numbers stay with the Bangla phrase instead of splitting OCR words at punctuation.
      if (!/[a-z]/i.test(item.str) || /[\u0980-\u09ff]/u.test(item.str) || damagedText.test(item.str)) run.push(item);
      else flush();
    }
    flush();
  }
  return spans;
}

const modelPath = fileURLToPath(new URL('../assets/ocr/', import.meta.url));
const MODEL_HASHES: Record<string, string> = {
  ben: 'a7c1fd170b796d6b8d01b401d4bfcc54409f47b313a200e9e3756ce20d742725',
  eng: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
};
let verified: Promise<void> | undefined;
function verifyModels(): Promise<void> {
  return verified ??= Promise.all(Object.entries(MODEL_HASHES).map(async ([language, hash]) => {
    const data = await readFile(`${modelPath}${language}.traineddata.gz`);
    if (createHash('sha256').update(data).digest('hex') !== hash) throw new Error('OCR model checksum mismatch.');
  })).then(() => undefined).catch((error) => { verified = undefined; throw error; });
}

/** One lazy worker per import, released even if a later page fails. */
export class BanglaRecovery {
  private worker?: Promise<Worker>;
  private async getWorker(): Promise<Worker> {
    await verifyModels();
    return this.worker ??= createWorker(['ben', 'eng'], 1, { langPath: modelPath, gzip: true,
      cacheMethod: 'none', errorHandler: () => {} });
  }

  async recover(page: PDFPageProxy, items: PositionedText[]): Promise<{
    items: PositionedText[]; fields: { field: 'name' | 'address'; confidence: number }[];
  }> {
    const spans = banglaSpans(items);
    if (!spans.length) return { items, fields: [] };
    const worker = await this.getWorker();
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, user_defined_dpi: '600' });
    const replacements = new Map<PositionedText, PositionedText>();
    const removed = new Set<PositionedText>();
    const fields = new Map<'name' | 'address', number>();
    for (const span of spans) {
      // Crop bounds include hanging vowel marks. A white border gives OCR clean line edges.
      const em = Math.max(...span.context.map((item) => item.height));
      const left = Math.min(...span.context.map((item) => item.transform[4]!)) - em * 0.2;
      // Type 3 fonts can report zero advance for visible conjuncts. Read to the value-column edge.
      const right = Math.max(...span.context.map((item) => item.transform[4]! + Math.max(item.width, em * 0.8)), page.view[2]! - 5) + em * 0.2;
      const top = Math.max(...span.context.map((item) => item.transform[5]! + item.height * 1.15));
      const bottom = Math.min(...span.context.map((item) => item.transform[5]! - item.height * 0.4));
      if (!Number.isFinite(em) || em <= 0 || right <= left || top <= bottom) continue;
      const scale = Math.min(600 / 72, 2300 / (right - left), 500 / (top - bottom));
      const viewport = page.getViewport({ scale });
      const [a, b, c, d, e, f] = viewport.transform as [number, number, number, number, number, number];
      const corners = [[left, bottom], [left, top], [right, bottom], [right, top]].map(([x, y]) => [a * x! + c * y! + e, b * x! + d * y! + f]);
      const x = Math.floor(Math.min(...corners.map((point) => point[0]!))); const y = Math.floor(Math.min(...corners.map((point) => point[1]!)));
      const border = 24;
      const width = Math.ceil((right - left) * scale), height = Math.ceil((top - bottom) * scale);
      const canvas = createCanvas(width + border * 2, height + border * 2);
      const context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.save(); context.beginPath(); context.rect(border, border, width, height); context.clip();
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D, viewport,
        transform: [1, 0, 0, 1, border - x, border - y], background: 'rgb(255,255,255)' }).promise;
      context.restore();
      const spanLeft = Math.min(...span.items.map((item) => item.transform[4]!));
      const spanRight = Math.max(...span.items.map((item) => item.transform[4]! + Math.max(item.width, em * 0.8))) + em * 0.3;
      const targetX = [a * spanLeft + c * top + e, a * spanRight + c * top + e];
      const targetLeft = Math.min(...targetX) - x + border, targetRight = Math.max(...targetX) - x + border;
      const readings: OcrReading[] = [];
      const points = span.items.filter((item) => /[\p{L}\p{N}]/u.test(item.str) || damagedText.test(item.str))
        .map((item) => a * (item.transform[4]! + Math.min(item.width / 2, em * 0.3)) + c * item.transform[5]! + e - x + border);
      // Compare every wrapped line at two scales. A third scale retries uncertain
      // readings, including differences in glyph rasterization between platforms.
      let best: ReturnType<typeof combineReadings>;
      for (const factor of [0.75, 1, 0.6]) {
        if (factor === 0.6 && best && best.confidence >= 60 && best.coverage >= 0.9) break;
        const image = factor === 1 ? canvas : createCanvas(Math.round(canvas.width * factor), Math.round(canvas.height * factor));
        if (image !== canvas) image.getContext('2d').drawImage(canvas, 0, 0, image.width, image.height);
        const result = await worker.recognize(image.toBuffer('image/png'), {}, { text: true, blocks: true });
        const words: OcrWord[] = (result.data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))) ?? [])
          .map((word) => ({ text: cleanPdfText(word.text), confidence: word.confidence,
            bbox: { x0: word.bbox.x0 / factor, x1: word.bbox.x1 / factor, y0: word.bbox.y0 / factor, y1: word.bbox.y1 / factor } }))
          .filter((word) => word.text && (word.bbox.x0 + word.bbox.x1) / 2 >= targetLeft && (word.bbox.x0 + word.bbox.x1) / 2 <= targetRight &&
            (/^[\p{P}\p{S}]+$/u.test(word.text) || (/[\p{L}\p{N}]/u.test(word.text) && word.bbox.y1 - word.bbox.y0 >= em * scale * 0.35)));
        // House and postal numbers already readable in the PDF do not need optical transcription.
        for (const item of span.items.filter((item) => /^[0-9০-৯]+(?:[/.\-][0-9০-৯]+)*$/u.test(item.str.trim()))) {
          const numberX = a * (item.transform[4]! + item.width / 2) + c * item.transform[5]! + e - x + border;
          const numberWidth = Math.abs(a * item.width);
          const word = words.find((word) => /^[0-9০-৯OIl|.,/()\-]+$/u.test(word.text) &&
            numberX >= word.bbox.x0 - em * scale * 0.2 && numberX <= word.bbox.x1 + em * scale * 0.2 &&
            word.bbox.x1 - word.bbox.x0 <= Math.max(numberWidth * 1.6, em * scale));
          if (word) { word.text = word.text.replace(/[0-9০-৯OIl|]+(?:[/.\-][0-9০-৯OIl|]+)*/u, item.str.trim()); word.confidence = 100; }
        }
        const covered = points.filter((point) => words.some((word) => point >= word.bbox.x0 - em * scale * 0.3 && point <= word.bbox.x1 + em * scale * 0.3)).length;
        readings.push({ words, coverage: points.length ? covered / points.length : 0 });
        best = combineReadings(readings);
      }
      if (!best || best.confidence < 60 || best.coverage < 0.9) continue;
      let text = cleanPdfText(best.words.map((word) => word.text).join(' '));
      // Keep punctuation belonging to the next, directly extracted Latin run in its original place.
      if (/[\u0980-\u09ff]$/u.test(joinPdfText(span.items))) text = text.replace(/[,;:.!?]+$/u, '');
      if (!text || needsRecovery(text) || !/[\u0980-\u09ff]/u.test(text)) continue;
      const first = span.items[0]!;
      const originalLeft = first.transform[4]!;
      replacements.set(first, { ...first, str: text, width: Math.max(...span.items.map((item) => item.transform[4]! + item.width)) - originalLeft });
      span.items.slice(1).forEach((item) => removed.add(item));
      fields.set(span.field, Math.min(fields.get(span.field) ?? 100, best.confidence));
    }
    return { items: items.filter((item) => !removed.has(item)).map((item) => replacements.get(item) ?? item),
      fields: [...fields].map(([field, confidence]) => ({ field, confidence })) };
  }

  async close(): Promise<void> {
    const worker = await this.worker?.catch(() => undefined);
    await worker?.terminate();
  }
}
