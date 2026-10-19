import { mkdir, writeFile } from 'node:fs/promises';
import { generateLabels } from '../dist/label.js';
import { thermalRequest } from '../dist/thermal.js';

const sample = {
  name: 'Rakib Hasan', phone: '01780282878', cod: 849, parcelId: '000309479004',
  address: 'Flat B-7, 7th Floor, House 128, Road 12, Block C, Bashundhara Residential Area, near Apollo Gate and the community mosque, Vatara, Dhaka North City Corporation, Dhaka 1229, Dhaka Division, Bangladesh.',
};
const bangla = { ...sample, name: 'রাকিব হাসান', address: 'জীবননগর, চুয়াডাঙ্গা, বাংলাদেশ' };
const output = new URL('../output/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('arvono-thermal-request.json', output), JSON.stringify(sample, null, 2) + '\n');
for (const [preset, shipment] of [
  ['4x6', sample], ['3x3', bangla], ['58x100mm', { ...bangla, phone: '০১৭৮০২৮২৮৭৮' }],
]) {
  const job = thermalRequest([shipment], { preset });
  const pdf = await generateLabels(job.shipments, { thermal: true, dpi: job.dpi });
  const filename = `arvono-thermal-${preset}.pdf`;
  await writeFile(new URL(filename, output), pdf);
  console.log(`Generated output/${filename}`);
}
