import { mkdir, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { generateA4Sheets } from '../dist/label.js';

const names = ['Rakib Hasan', 'রাকিব হাসান', 'Nusrat Jahan', 'Sadia Islam', 'Arif Rahman', 'Tanvir Ahmed', 'Farhana Akter', 'Mahmud Hasan', 'Nabila Rahman', 'Samiul Islam'];
const shipments = names.map((name, index) => ({
  name,
  phone: '01780282878',
  address: index === 1 ? 'জীবননগর, চুয়াডাঙ্গা, বাংলাদেশ' : 'Jibonnagar, Chuadanga, Bangladesh',
  cod: 849 + index * 50,
  parcelId: `000${309479001 + index}`,
}));
const output = new URL('../output/', import.meta.url);
const separate = new URL('a4-sheets/', output);
await mkdir(separate, { recursive: true });
await writeFile(new URL('arvono-a4-shipments.json', output), JSON.stringify(shipments, null, 2) + '\n');
const [combined] = await generateA4Sheets(shipments);
await writeFile(new URL('arvono-a4-10-labels.pdf', output), combined);
const pages = await generateA4Sheets(shipments, { split: true });
const files = {};
for (const [index, pdf] of pages.entries()) {
  const filename = `arvono-a4-${String(index + 1).padStart(3, '0')}.pdf`;
  files[filename] = pdf;
  await writeFile(new URL(filename, separate), pdf);
}
await writeFile(new URL('arvono-a4-10-labels.zip', output), zipSync(files, { level: 0 }));
console.log('Generated 10 labels on 2 A4 sheets: combined PDF, separate PDFs, ZIP and example request JSON in output/.');
