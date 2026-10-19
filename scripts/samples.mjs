import { mkdir, writeFile } from 'node:fs/promises';
import { generateLabels } from '../dist/label.js';

const shipment = { name: 'Rakib', phone: '01780282878', address: 'Jibonnagar, Chuadanga, Bangladesh', cod: 849, parcelId: '309479004' };
const output = new URL('../output/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [filename, size] of [
  ['arvono-sample.pdf', { width: 3, height: 3, unit: 'in' }],
  ['arvono-sample-4x3.pdf', { width: 4, height: 3, unit: 'in' }],
]) {
  await writeFile(new URL(filename, output), await generateLabels([{ ...shipment, size }]));
  console.log(`Generated output/${filename}`);
}
