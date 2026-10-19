import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { importPdf, MAX_PDF_BYTES } from './import.js';

const root = new URL('../', import.meta.url);
const assets = [
  ['/', 'web/index.html', 'text/html; charset=utf-8'],
  ['/app.css', 'web/app.css', 'text/css; charset=utf-8'],
  ['/app.js', 'web/app.js', 'text/javascript; charset=utf-8'],
  ['/vendor/pdf.mjs', 'node_modules/pdfjs-dist/build/pdf.mjs', 'text/javascript'],
  ['/vendor/pdf.worker.mjs', 'node_modules/pdfjs-dist/build/pdf.worker.mjs', 'text/javascript'],
  ...['InstrumentSerif-Regular', 'InstrumentSans-Regular', 'InstrumentSans-SemiBold', 'AnekBangla-Regular'].map((font) =>
    [`/fonts/${font}.ttf`, `assets/fonts/${font}.ttf`, 'font/ttf']),
];

export function registerWeb(app: FastifyInstance): void {
  for (const [url, path, type] of assets) app.get(url!, async (_request, reply) => {
    return reply.type(type!).header('Cache-Control', 'no-cache')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
      .send(await readFile(new URL(path!, root)));
  });
  // PDF.js reads only allowlisted support files, never arbitrary workspace paths.
  app.get('/vendor/:kind/:file', async (request, reply) => {
    const { kind, file } = request.params as { kind: string; file: string };
    if (!['cmaps', 'standard_fonts', 'wasm'].includes(kind) || !/^[a-zA-Z0-9_-]+\.(bcmap|pfb|ttf|wasm|js)$/.test(file)) return reply.code(404).send();
    try { return reply.type(file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
      .send(await readFile(new URL(`node_modules/pdfjs-dist/${kind}/${file}`, root))); }
    catch { return reply.code(404).send(); }
  });
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer', bodyLimit: MAX_PDF_BYTES }, (_request, body, done) => done(null, body));
  app.post('/import/pdf', { bodyLimit: MAX_PDF_BYTES }, async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'INVALID_CONTENT_TYPE', message: 'Send the PDF with Content-Type: application/pdf.' });
    return reply.header('Cache-Control', 'no-store').send(await importPdf(request.body));
  });
}
