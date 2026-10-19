import Fastify from 'fastify';
import { generateA4Sheets, generateLabels } from './label.js';
import { LabelError, validateBatch, validateShipment } from './types.js';
import { THERMAL_PRESETS, thermalRequest } from './thermal.js';
import { registerWeb } from './web.js';
import { registerFulfillment, type FulfillmentOptions } from './fulfillment.js';
import { downloadName, sheetZip } from './download.js';

export function buildApp(logging = false, options: { fulfillment?: FulfillmentOptions } = {}) {
  const app = Fastify({ logger: logging, bodyLimit: 8 * 1024 * 1024 });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof LabelError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message,
        ...(error.field ? { field: error.field } : {}),
        ...(error.labelIndex !== undefined ? { labelIndex: error.labelIndex } : {}) });
    }
    const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    if (status === 500) request.log.error(error);
    return reply.code(status).send({ error: status === 500 ? 'PDF_GENERATION_FAILED' : 'INVALID_REQUEST',
      message: status === 500 ? 'Unable to generate the PDF.' : error instanceof Error ? error.message : 'Invalid request.' });
  });
  registerWeb(app);
  registerFulfillment(app, options.fulfillment);
  app.post('/generate', async (request, reply) => {
    const shipment = validateShipment(request.body);
    const pdf = await generateLabels([shipment]);
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="${downloadName('individual', 1)}.pdf"`)
      .header('Cache-Control', 'no-store').send(pdf);
  });
  app.post('/batch', async (request, reply) => {
    const shipments = validateBatch(request.body);
    const pdf = await generateLabels(shipments);
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="${downloadName('individual', shipments.length)}.pdf"`)
      .header('Cache-Control', 'no-store').send(pdf);
  });
  app.post('/a4', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const output = query.output ?? 'pdf';
    if (output !== 'pdf' && output !== 'zip') {
      throw new LabelError('output must be "pdf" or "zip".', 400, 'INVALID_INPUT', 'output');
    }
    if (query.cutMarks !== undefined && query.cutMarks !== 'true' && query.cutMarks !== 'false') {
      throw new LabelError('cutMarks must be "true" or "false".', 400, 'INVALID_INPUT', 'cutMarks');
    }
    const shipments = validateBatch(request.body);
    const pdfs = await generateA4Sheets(shipments, { split: output === 'zip', cutMarks: query.cutMarks !== 'false' });
    const stem = downloadName('a4', shipments.length);
    reply.header('Cache-Control', 'no-store');
    if (output === 'zip') {
      return reply.type('application/zip').header('Content-Disposition', `attachment; filename="${stem}.zip"`)
        .send(sheetZip(pdfs, stem));
    }
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="${stem}.pdf"`).send(pdfs[0]!);
  });
  app.get('/thermal/presets', async () => ({ defaultPreset: '4x6', defaultDpi: 203, supportedDpi: [203, 300], presets: THERMAL_PRESETS }));
  app.post('/thermal', async (request, reply) => {
    const job = thermalRequest([validateShipment(request.body)], request.query as Record<string, unknown>);
    const pdf = await generateLabels(job.shipments, { thermal: true, dpi: job.dpi });
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="${downloadName('thermal', 1)}.pdf"`)
      .header('Cache-Control', 'no-store').send(pdf);
  });
  app.post('/thermal/batch', async (request, reply) => {
    const job = thermalRequest(validateBatch(request.body), request.query as Record<string, unknown>);
    const pdf = await generateLabels(job.shipments, { thermal: true, dpi: job.dpi });
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="${downloadName('thermal', job.shipments.length)}.pdf"`)
      .header('Cache-Control', 'no-store').send(pdf);
  });
  return app;
}
