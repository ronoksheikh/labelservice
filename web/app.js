import { getDocument, GlobalWorkerOptions } from '/vendor/pdf.mjs';
GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';
const PDF_OPTIONS = { useSystemFonts: false, cMapUrl: '/vendor/cmaps/',
  standardFontDataUrl: '/vendor/standard_fonts/', wasmUrl: '/vendor/wasm/', verbosity: 0 };
const $ = (id) => document.getElementById(id);
const fieldNames = ['parcelId', 'name', 'phone', 'cod', 'address'];
const state = { records: [], sources: [], active: 0, format: 'a4', preview: 'label', importing: false, downloading: false,
  mode: 'pdf', connected: false, loadingOrders: false, queueStatus: 'unprinted', cursor: null, job: null, jobs: [] };
let previewTimer, previewVersion = 0, previewController, renderTask, generatedTask;
const money = (value) => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const selected = () => state.records.filter((record) => record.selected);
const current = () => state.records[state.active];
function notice(message, success = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('success', success);
  $('notice').hidden = !message;
}
function problems(record) {
  const value = record.values;
  const errors = {};
  for (const [field, max] of [['name', 160], ['phone', 40], ['address', 1600], ['parcelId', 80]]) {
    if (!value[field].trim()) errors[field] = 'Enter this detail from the original label.';
    else if (value[field].length > max) errors[field] = `Use at most ${max} characters.`;
    else if (/[\x00-\x08\x0b-\x1f\x7f\ufffd\ue000-\uf8ff]/u.test(value[field])) errors[field] = 'Unreadable PDF characters. Check the original and correct this text.';
    else if (!record.orderId && ['name', 'address'].includes(field) && /[\u09BE-\u09C4\u09C7\u09C8\u09CB\u09CC\u09D7]{2}|(^|[\s,;:()\-])[\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7]/u.test(value[field].normalize('NFC'))) errors[field] = 'Bangla vowel order appears damaged. Check the spelling against the original.';
  }
  if (value.parcelId && !/^[\x21-\x7e]+$/.test(value.parcelId.trim())) errors.parcelId = 'Use the SF-ID without spaces; it must work in a Code 128 barcode.';
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.cod.trim()) || Number(value.cod) > 999999999.99) errors.cod = 'Enter an amount from 0 to 999999999.99, with up to 2 decimals.';
  if (record.selected && value.parcelId && state.records.some((other) => other !== record && other.selected && other.values.parcelId.trim() === value.parcelId.trim())) errors.parcelId = 'Duplicate parcel ID in this batch. Correct it or deselect the duplicate.';
  if (record.issues.some((issue) => issue.code === 'MULTIPLE_LABELS')) errors.page = 'This page contains multiple labels. Re-export one courier label per page.';
  else if (record.issues.some((issue) => issue.field === 'page') && !record.manualReviewed) errors.page = 'Check this page manually against the original, then confirm below.';
  if (record.layoutError) errors[record.layoutError.field || 'page'] = record.layoutError.message;
  return errors;
}
function shipment(record) {
  const { name, phone, address, parcelId, cod } = record.values;
  const result = { name: name.trim(), phone: phone.trim(), address: address.trim(), parcelId: parcelId.trim(), cod: Number(cod) };
  if (state.format === 'individual') {
    const [width, height] = $('label-size').value.split('x').map(Number);
    result.size = { width, height, unit: 'in' };
  }
  return result;
}
function endpoint(preview = false) {
  if (state.format === 'thermal') return `/thermal/batch?preset=${encodeURIComponent($('thermal-size').value)}&dpi=${$('dpi').value}`;
  if (state.format === 'a4' && (!preview || state.preview === 'sheet')) return `/a4?cutMarks=${$('cut-marks').checked}&output=${!preview && $('split-sheets').checked ? 'zip' : 'pdf'}`;
  return '/batch';
}
function dimensions() {
  if (state.format === 'a4') return '3 × 3 in';
  if (state.format === 'thermal') return $('thermal-size').selectedOptions[0].textContent.replace('inches', 'in');
  return $('label-size').selectedOptions[0].textContent.replace('inches', 'in');
}
function updateSummary() {
  const records = selected();
  const bad = records.filter((record) => Object.keys(problems(record)).length).length;
  const pages = state.format === 'a4' ? Math.ceil(records.length / 6) : records.length;
  $('batch-summary').textContent = `${records.length} label${records.length === 1 ? '' : 's'} selected${records.length ? ` · ${pages} ${state.format === 'a4' ? `A4 sheet${pages === 1 ? '' : 's'}` : `PDF page${pages === 1 ? '' : 's'}`}` : ''}`;
  $('batch-status').textContent = !records.length ? 'Select the parcels you want to print.' : bad ? `${bad} ${bad === 1 ? 'label needs' : 'labels need'} attention before download.` : 'Ready to download.';
  const busy = state.downloading || state.importing || state.loadingOrders;
  const needsReason = state.mode === 'fulfillment' && state.queueStatus === 'printed' && !state.job;
  const tooMany = state.mode === 'fulfillment' && records.length > 500;
  const reasonMissing = needsReason && $('reprint-reason').value.trim().length < 3;
  $('reprint-panel').hidden = !needsReason;
  if (tooMany) $('batch-status').textContent = 'Select at most 500 booked labels per print job.';
  if (needsReason && reasonMissing) $('batch-status').textContent = 'Add a reason before preparing this reprint.';
  if (state.job?.status === 'ready') $('batch-status').textContent = 'After printing, select the labels that printed and confirm below.';
  $('download').disabled = !records.length || !!bad || busy || reasonMissing || tooMany || !!(state.job && state.job.status !== 'ready');
  $('clear-all').disabled = busy || !!state.job;
  $('pdf-input').disabled = busy || !!state.job;
  $('load-orders').disabled = !state.connected || busy || !!state.job;
  $('load-more').disabled = busy || !!state.job;
  $('download-label').textContent = state.downloading ? 'Preparing…' : `${state.job ? 'Download again' : state.mode === 'fulfillment' ? 'Prepare' : 'Download'} ${state.format === 'a4' && $('split-sheets').checked ? 'ZIP' : 'PDF'}`;
  $('select-all').checked = records.length === state.records.length;
  $('select-all').indeterminate = records.length > 0 && records.length < state.records.length;
  $('print-tip').textContent = state.format === 'a4' ? 'Print on A4 at Actual size / 100%. The ruler on each sheet should measure 25.4 mm.' : `Print at Actual size / 100% on ${dimensions()} stock. One PDF page per label.`;
  for (const input of document.querySelectorAll('.print-settings input,.print-settings select')) input.disabled = busy || !!state.job;
  updateJobPanel();
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function updateList() {
  const list = $('parcel-list');
  const scroll = list.scrollTop;
  const fragment = document.createDocumentFragment();
  state.records.forEach((record, index) => {
    const errors = problems(record), bad = Object.keys(errors).length > 0;
    const row = element('li', `parcel-row${index === state.active ? ' active' : ''}`);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = record.selected; checkbox.disabled = state.downloading || !!(state.job && state.job.status !== 'ready');
    checkbox.setAttribute('aria-label', `Include parcel ${record.values.parcelId || `on page ${record.page}`}`);
    checkbox.addEventListener('change', () => { record.selected = checkbox.checked; update(false); schedulePreview(); });
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-current', index === state.active ? 'true' : 'false');
    button.addEventListener('click', () => { state.active = index; update(); schedulePreview(0); });
    const top = element('span', 'parcel-topline');
    top.append(element('strong', 'parcel-id', record.values.parcelId || 'Missing SF-ID'), element('span', 'page-tag', record.orderName || `p. ${record.page}`));
    const bottom = element('span', 'parcel-bottom');
    bottom.append(element('span', 'parcel-cod', record.values.cod.trim() ? `৳ ${money(record.values.cod)}` : 'COD missing'), element('span', `status-pill${bad ? ' review' : ''}`, bad ? 'Needs review' : record.recovery?.length ? 'Fixed' : 'Complete'));
    button.append(top, element('span', 'parcel-name', record.values.name || 'Recipient not found'), bottom);
    row.append(checkbox, button); fragment.append(row);
  });
  list.replaceChildren(fragment); list.scrollTop = scroll;
  $('parcel-count').textContent = String(state.records.length);
}
function updateEditor(syncInputs = true) {
  const record = current();
  if (!record) return;
  const errors = problems(record);
  $('source-line').textContent = record.orderId ? `${record.orderName} / Booked ${record.bookedDate || 'with Steadfast'}` : `${state.sources[record.source].name} / Page ${record.page}`;
  for (const field of fieldNames) {
    const input = $(`field-${field}`);
    if (syncInputs) input.value = record.values[field];
    input.readOnly = !!record.orderId;
    input.setAttribute('aria-invalid', String(!!errors[field]));
    input.setAttribute('aria-describedby', `error-${field}`);
    $(`error-${field}`).textContent = errors[field] || '';
  }
  const messages = [];
  if (errors.page) messages.push(errors.page);
  if (Object.values(errors).some((message) => message.includes('Unreadable'))) messages.push('Some Bangla glyphs have no readable text mapping in the source PDF. The Original PDF tab shows how they should look.');
  $('review-note').textContent = messages.join('\n'); $('review-note').hidden = !messages.length;
  $('manual-review-label').hidden = !record.issues.some((issue) => issue.code === 'UNRECOGNIZED_LAYOUT');
  $('manual-review').checked = record.manualReviewed;
  const metadata = $('source-metadata'); metadata.replaceChildren();
  for (const [key, title] of [['invoice', 'Invoice'], ['area', 'Source area'], ['note', 'Courier note']]) {
    if (record.metadata[key]) metadata.append(element('dt', '', title), element('dd', '', record.metadata[key]));
  }
  if (record.recovery?.length) metadata.append(element('dt', '', 'Bangla text'), element('dd', '', 'Fixed automatically'));
  document.querySelector('.editor-panel .mini-note').textContent = record.orderId ? 'Courier records' : 'Editable';
  $('details-footnote').textContent = record.orderId ? 'Recipient details match the courier booking.' : 'Changes stay in this tab until you clear or close it.';
}
function update(syncInputs = true) {
  const hasRecords = !!state.records.length || !!state.job;
  document.body.classList.toggle('has-labels', hasRecords);
  $('studio').hidden = !hasRecords; $('empty-state').hidden = hasRecords;
  $('tab-original').hidden = state.mode === 'fulfillment';
  updateSummary();
  if (!hasRecords) {
    $('parcel-list').replaceChildren(); $('source-metadata').replaceChildren(); $('source-line').textContent = '';
    for (const field of fieldNames) { $(`field-${field}`).value = ''; $(`error-${field}`).textContent = ''; }
    $('preview-canvas').hidden = true; $('preview-canvas').width = 0; $('preview-canvas').height = 0;
    $('preview-caption').textContent = ''; $('review-note').textContent = ''; $('manual-review').checked = false;
    return;
  }
  updateList(); updateEditor(syncInputs);
}
async function importFiles(files) {
  if (state.importing || state.downloading || state.loadingOrders || state.job) return;
  if (state.mode !== 'pdf') { resetWorkspace(); state.mode = 'pdf'; }
  state.importing = true; updateSummary(); notice('Reading PDF fields and recovering damaged Bangla text…');
  $('pdf-input').disabled = true;
  const errors = [];
  let added = 0, firstAdded = state.records.length;
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') { errors.push(`${file.name}: choose a PDF file.`); continue; }
    if (file.size > 10 * 1024 * 1024) { errors.push(`${file.name}: exceeds the 10 MiB limit.`); continue; }
    try {
      const response = await fetch('/import/pdf', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to import this file.');
      if (state.records.length + result.labels.length > 1000) throw new Error('A workspace can contain up to 1,000 labels.');
      const source = state.sources.length; state.sources.push({ file, name: file.name, task: null });
      state.records.push(...result.labels.map((record) => ({ ...record, source, selected: true, manualReviewed: false,
        values: { ...record.fields, cod: record.fields.cod === null ? '' : String(record.fields.cod) } })));
      added += result.labels.length;
    } catch (error) { errors.push(`${file.name}: ${error.message || 'Unable to connect to the server.'}`); }
  }
  state.importing = false; $('pdf-input').disabled = false; $('pdf-input').value = '';
  if (added) {
    state.active = firstAdded;
    const reviewCount = state.records.filter((record) => Object.keys(problems(record)).length).length;
    notice(`${added} labels imported.${reviewCount ? ` ${reviewCount} ${reviewCount === 1 ? 'label needs' : 'labels need'} review. Check highlighted details against the original.` : ' Ready to download.'}${errors.length ? `\n${errors.join('\n')}` : ''}`, !errors.length && !reviewCount);
  } else notice(errors.join('\n') || 'No PDF files were selected.');
  update(); schedulePreview(0);
}
function schedulePreview(delay = 400) {
  clearTimeout(previewTimer);
  ++previewVersion;
  $('preview-content').setAttribute('aria-busy', 'true');
  previewController?.abort(); renderTask?.cancel();
  previewTimer = setTimeout(() => void refreshPreview(previewVersion), delay);
}
function previewMessage(text) {
  $('preview-message').textContent = text; $('preview-message').hidden = false; $('preview-canvas').hidden = true;
}
async function pdfResponse(records, preview, signal) {
  const response = await fetch(endpoint(preview), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(records.map(shipment)), signal });
  if (!response.ok) {
    const error = await response.json();
    error.record = records[error.labelIndex ?? 0];
    throw Object.assign(new Error(error.message || 'Unable to create labels.'), error);
  }
  return response;
}
async function refreshPreview(version) {
  const record = current();
  if (!record) { $('preview-content').setAttribute('aria-busy', 'false'); return; }
  $('preview-dimensions').textContent = state.preview === 'original' ? 'Courier PDF' : state.preview === 'sheet' ? 'A4 · 210 × 297 mm' : dimensions();
  $('preview-caption').textContent = '';
  previewMessage('Preparing preview…');
  const controller = new AbortController(); previewController = controller;
  try {
    let pdf, pageNumber = 1;
    const obsolete = generatedTask; generatedTask = undefined;
    if (obsolete) await obsolete.destroy();
    if (version !== previewVersion) return;
    if (state.preview === 'original') {
      const source = state.sources[record.source];
      if (!source.task) source.task = getDocument({ data: new Uint8Array(await source.file.arrayBuffer()), ...PDF_OPTIONS });
      pdf = await source.task.promise; pageNumber = record.page;
    } else {
      const records = state.preview === 'sheet' ? (state.job ? state.records : selected()) : [record];
      if (!records.length) return previewMessage('Select parcels to preview an A4 sheet.');
      if (records.some((entry) => Object.keys(problems(entry)).length)) return previewMessage(state.preview === 'sheet' ? 'Correct the highlighted details in the selected parcels to preview the A4 sheets.' : 'Correct the highlighted details to preview this label. You can check the Original PDF at any time.');
      const response = await pdfResponse(records, true, controller.signal);
      const data = new Uint8Array(await response.arrayBuffer());
      if (version !== previewVersion) return;
      generatedTask = getDocument({ data, ...PDF_OPTIONS });
      pdf = await generatedTask.promise;
      if (state.preview === 'sheet') pageNumber = Math.max(1, Math.floor(records.indexOf(record) / 6) + 1);
    }
    if (version !== previewVersion) return;
    const page = await pdf.getPage(pageNumber);
    if (version !== previewVersion) return;
    const base = page.getViewport({ scale: 1 });
    const stage = $('preview-content');
    const width = Math.min(stage.clientWidth - 44, 480);
    const height = window.innerWidth < 1150 ? 470 : 420;
    const scale = Math.min(width / base.width, height / base.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas'); canvas.id = 'preview-canvas'; canvas.setAttribute('aria-label', `${state.preview === 'original' ? 'Original courier PDF' : 'Generated ARVONO PDF'}, page ${pageNumber}`);
    const viewport = page.getViewport({ scale: scale * ratio });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${base.width * scale}px`; canvas.style.height = `${base.height * scale}px`;
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport });
    await renderTask.promise;
    if (version !== previewVersion) return;
    $('preview-canvas').replaceWith(canvas); $('preview-message').hidden = true;
    $('preview-caption').textContent = state.preview === 'original' ? `Source page ${pageNumber} of ${pdf.numPages} · ${state.sources[record.source].name}` : state.preview === 'sheet' ? `Sheet ${pageNumber} of ${pdf.numPages} · 6 labels per full sheet` : `Parcel ${record.values.parcelId} · actual generated PDF`;
    page.cleanup();
  } catch (error) {
    if (version !== previewVersion || error.name === 'AbortError' || error.name === 'RenderingCancelledException') return;
    if (error.record) { error.record.layoutError = { field: error.field, message: error.message }; update(false); }
    previewMessage(error.message || 'Preview unavailable. Check the file and try again.');
  } finally {
    if (version === previewVersion) $('preview-content').setAttribute('aria-busy', 'false');
  }
}
async function download() {
  const records = selected();
  if (!records.length || records.some((record) => Object.keys(problems(record)).length)) return;
  state.downloading = true; updateSummary(); notice('');
  try {
    if (state.mode === 'fulfillment') {
      if (!state.job) {
        const requestId = operationId();
        try {
          const job = await jsonRequest('/fulfillment/jobs', { orderIds: records.map((record) => record.orderId),
            mode: state.queueStatus === 'printed' ? 'reprint' : 'pending', reason: $('reprint-reason').value,
            upTo: $('queue-date').value, options: printOptions() }, requestId);
          showJob(job);
        } catch (error) {
          // The server saves the request key before reserving orders. Recover this same operation after a timeout.
          try { showJob(await jsonRequest(`/fulfillment/jobs/${requestId}`)); } catch {}
          throw error;
        }
      }
      await downloadJob();
      await refreshHistory(); await refreshSummary();
      return;
    }
    const response = await pdfResponse(records, false);
    await saveResponse(response);
    notice(`${records.length} labels downloaded. Print at Actual size / 100% to keep the sizing accurate.`, true);
  } catch (error) {
    if (error.record) { error.record.layoutError = { field: error.field, message: error.message }; state.active = state.records.indexOf(error.record); }
    notice(error.message || 'Unable to create labels.');
    schedulePreview(0);
  } finally { state.downloading = false; update(); }
}
function selectPreview(mode) {
  state.preview = mode;
  document.querySelectorAll('[data-preview]').forEach((button) => {
    const active = button.dataset.preview === mode;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
  });
  $('preview-content').setAttribute('aria-labelledby', `tab-${mode}`);
  schedulePreview(0);
}
$('pdf-input').addEventListener('change', (event) => void importFiles([...event.target.files]));
for (const type of ['dragenter', 'dragover']) $('drop-zone').addEventListener(type, (event) => { event.preventDefault(); $('drop-zone').classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) $('drop-zone').addEventListener(type, (event) => { event.preventDefault(); $('drop-zone').classList.remove('dragging'); });
$('drop-zone').addEventListener('drop', (event) => void importFiles([...event.dataTransfer.files]));
// Prevent the browser navigating away when a PDF is dropped just outside the target.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
$('select-all').addEventListener('change', (event) => { state.records.forEach((record) => { record.selected = event.target.checked; }); update(false); schedulePreview(); });
$('details-form').addEventListener('submit', (event) => event.preventDefault());
$('details-form').addEventListener('input', (event) => {
  const record = current(), field = event.target.name;
  if (!record || !fieldNames.includes(field)) return;
  record.values[field] = event.target.value; record.layoutError = undefined;
  notice('');
  update(false); schedulePreview();
});
$('manual-review').addEventListener('change', (event) => { current().manualReviewed = event.target.checked; update(false); schedulePreview(0); });
document.querySelectorAll('[name=format]').forEach((input) => input.addEventListener('change', () => {
  state.format = input.value;
  for (const format of ['a4', 'individual', 'thermal']) $(`${format}-settings`).hidden = format !== state.format;
  $('tab-sheet').hidden = state.format !== 'a4';
  if (state.preview === 'sheet' && state.format !== 'a4') selectPreview('label');
  state.records.forEach((record) => { record.layoutError = undefined; }); update(false); schedulePreview(0);
}));
for (const id of ['cut-marks', 'split-sheets', 'label-size', 'thermal-size', 'dpi']) $(id).addEventListener('change', () => {
  state.records.forEach((record) => { record.layoutError = undefined; }); update(false); schedulePreview(0);
});
document.querySelectorAll('[data-preview]').forEach((button) => {
  button.addEventListener('click', () => selectPreview(button.dataset.preview));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-preview]')].filter((tab) => !tab.hidden);
    const index = tabs.indexOf(button);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus(); selectPreview(next.dataset.preview);
  });
});
$('download').addEventListener('click', () => void download());
$('clear-all').addEventListener('click', () => {
  if (state.importing || state.downloading || state.loadingOrders || state.job) return;
  resetWorkspace(); notice(''); update();
  $('preview-content').setAttribute('aria-busy', 'false');
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => schedulePreview(0), 200); });

function operationId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function jsonRequest(path, body, key) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || result.error || 'Unable to complete this request.');
  return result;
}
async function saveResponse(response) {
  if (!response.ok) { const error = await response.json(); throw new Error(error.message || 'Unable to download this file.'); }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || `arvono-labels-${Date.now()}.${blob.type.includes('zip') ? 'zip' : 'pdf'}`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function resetWorkspace() {
  ++previewVersion; clearTimeout(previewTimer); previewController?.abort(); renderTask?.cancel();
  for (const source of state.sources) source.task?.destroy().catch(() => {});
  generatedTask?.destroy().catch(() => {}); generatedTask = undefined;
  state.records = []; state.sources = []; state.active = 0; state.job = null;
  if (state.preview === 'original') selectPreview('label');
}
function orderRecord(order, selected = true) {
  const address = [order.shippingAddress?.address || ''];
  for (const part of [order.shippingAddress?.city, order.shippingAddress?.zip]) if (part && !address.join(', ').toLowerCase().includes(part.toLowerCase())) address.push(part);
  return { orderId: order.orderId, orderName: order.orderName || `Order ${order.orderId}`, bookedDate: order.bookedDate,
    page: 1, selected, manualReviewed: true, issues: [], recovery: [],
    metadata: { invoice: order.invoice, note: order.note },
    values: { name: order.customer?.name || '', phone: order.customer?.phone || '', address: address.filter(Boolean).join(', '),
      parcelId: order.consignmentId || '', cod: order.codAmount === null || order.codAmount === undefined ? '' : String(order.codAmount) } };
}
function printOptions() {
  const options = { format: state.format };
  if (state.format === 'a4') { options.cutMarks = $('cut-marks').checked; options.splitSheets = $('split-sheets').checked; }
  if (state.format === 'individual') { const [width, height] = $('label-size').value.split('x').map(Number); options.size = { width, height, unit: 'in' }; }
  if (state.format === 'thermal') { options.preset = $('thermal-size').value; options.dpi = Number($('dpi').value); }
  return options;
}
function applyPrintOptions(options) {
  state.format = options.format;
  document.querySelectorAll('[name=format]').forEach((input) => { input.checked = input.value === state.format; });
  for (const format of ['a4', 'individual', 'thermal']) $(`${format}-settings`).hidden = format !== state.format;
  $('tab-sheet').hidden = state.format !== 'a4';
  if (options.size) $('label-size').value = `${options.size.width}x${options.size.height}`;
  if (options.preset) $('thermal-size').value = options.preset;
  if (options.dpi) $('dpi').value = String(options.dpi);
  $('cut-marks').checked = options.cutMarks !== false; $('split-sheets').checked = !!options.splitSheets;
  if (state.preview === 'original' || (state.preview === 'sheet' && state.format !== 'a4')) selectPreview('label');
}
function showJob(job) {
  resetWorkspace(); state.mode = 'fulfillment';
  state.job = ['preparing', 'ready', 'confirmation_pending', 'release_pending'].includes(job.status) ? job : null;
  state.queueStatus = job.mode === 'reprint' ? 'printed' : 'unprinted';
  $('queue-filter').value = state.queueStatus;
  state.records = job.orders.map((order) => orderRecord(order, !job.confirmationIds || job.confirmationIds.includes(order.orderId)));
  applyPrintOptions(job.options); update(); schedulePreview(0);
}
const jobTime = (value) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
function updateJobPanel() {
  const job = state.job, busy = state.downloading;
  $('job-panel').hidden = !job;
  if (!job) return;
  const ready = job.status === 'ready', confirmation = job.status === 'confirmation_pending';
  $('job-title').textContent = ready ? job.mode === 'reprint' ? 'Reprint ready' : 'Labels reserved for this print job' : job.status.replaceAll('_', ' ');
  $('job-description').textContent = ready
    ? `${job.filename}. After printing, select the labels that printed and confirm. Unselected labels will be released.${job.expiresAt ? ` Reserved until ${jobTime(job.expiresAt)} BDT.` : ''}`
    : job.error || 'Resume this saved job to finish the pending operation.';
  $('confirm-printed').hidden = !ready && !confirmation;
  $('confirm-printed').textContent = confirmation ? 'Retry print confirmation' : `Confirm ${selected().length} printed`;
  $('confirm-printed').disabled = busy || !selected().length;
  $('release-job').hidden = !ready && job.status !== 'release_pending';
  $('release-job').textContent = job.mode === 'reprint' ? 'Cancel reprint' : 'Release unprinted labels';
  $('release-job').disabled = busy;
  $('resume-job').hidden = job.status !== 'preparing'; $('resume-job').disabled = busy;
  $('select-all').disabled = busy || !ready;
}
async function refreshSummary() {
  if (!state.connected) return;
  try {
    const summary = await jsonRequest(`/fulfillment/summary?upTo=${encodeURIComponent($('queue-date').value)}`);
    for (const key of ['unprinted', 'reserved', 'printed']) $(`queue-${key}`).textContent = String(summary[key] ?? 0);
  } catch { for (const key of ['unprinted', 'reserved', 'printed']) $(`queue-${key}`).textContent = '—'; }
}
async function loadOrders(append = false, onlyIds) {
  if (!state.connected || state.loadingOrders || state.job || state.downloading || state.importing) return;
  state.loadingOrders = true; updateSummary();
  $('queue-note').textContent = 'Loading courier bookings…';
  try {
    const query = new URLSearchParams({ upTo: $('queue-date').value, status: $('queue-filter').value });
    if (append && state.cursor) query.set('cursor', state.cursor);
    const result = await jsonRequest(`/fulfillment/orders?${query}`);
    if (!append) { resetWorkspace(); state.mode = 'fulfillment'; state.queueStatus = $('queue-filter').value; }
    const existing = new Set(state.records.map((record) => record.orderId));
    const newOrders = result.orders.filter((order) => !existing.has(order.orderId));
    const room = 1000 - state.records.length;
    state.records.push(...newOrders.slice(0, room).map((order) => orderRecord(order, onlyIds ? onlyIds.includes(order.orderId) : !append)));
    state.cursor = result.nextCursor;
    $('load-more').hidden = !state.cursor || state.records.length >= 1000;
    $('queue-note').textContent = `${state.records.length} ${state.queueStatus === 'printed' ? 'printed' : 'pending'} labels loaded, including earlier bookings through ${$('queue-date').value}.${state.cursor ? ' More bookings are available.' : ''}${state.queueStatus === 'printed' ? ' Reprints require a reason.' : ''}`;
    if (!state.records.length) $('queue-note').textContent = `No ${state.queueStatus === 'printed' ? 'printed' : 'pending'} labels through ${$('queue-date').value}.`;
    $('reprint-reason').value = '';
    await refreshSummary();
  } catch (error) { notice(error.message); $('queue-note').textContent = 'Could not load bookings. Try again.'; }
  finally { state.loadingOrders = false; update(); schedulePreview(0); }
}
async function downloadJob() {
  if (state.job?.status !== 'ready') throw new Error('Resume this print job before downloading.');
  await saveResponse(await fetch(`/fulfillment/jobs/${state.job.id}/file`));
  notice(`${state.job.orders.length} labels prepared. Open the downloaded file and print at 100%. Then confirm the labels that printed below.`, true);
}
async function jobAction(action) {
  if (!state.job || state.downloading) return;
  const job = state.job; state.downloading = true; update(false);
  let completed = false;
  try {
    const body = action === 'printed' ? { orderIds: job.confirmationIds || selected().map((record) => record.orderId) }
      : action === 'release' ? { reason: 'Operator released this job: not printed or printer failure' } : {};
    const result = await jsonRequest(`/fulfillment/jobs/${job.id}/${action}`, body);
    if (action === 'resume') { showJob(result); if (result.status === 'ready') await downloadJob(); }
    else {
      completed = true; resetWorkspace();
      const actual = result.result?.printed ?? 0;
      notice(action === 'release' ? 'Print job released. Unprinted labels can be prepared again.'
        : `${actual} labels confirmed printed.${result.status === 'partial' ? ' This job was only partly confirmed; check the saved results in history.' : ''}`, true);
    }
    await refreshHistory(); await refreshSummary();
  } catch (error) {
    try { showJob(await jsonRequest(`/fulfillment/jobs/${job.id}`)); } catch {}
    notice(error.message);
  } finally { state.downloading = false; update(); }
  if (completed) await loadOrders();
}
async function refreshHistory() {
  try {
    const { jobs } = await jsonRequest('/fulfillment/jobs'); state.jobs = jobs;
    const list = $('history-list'); list.replaceChildren();
    if (!jobs.length) { list.textContent = 'No saved print jobs yet.'; return; }
    for (const job of jobs) {
      const row = element('div', 'history-row'), details = element('div');
      const title = job.filename || `${job.options.format.toUpperCase()} · ${job.orders.length || job.requestedCount} labels`;
      details.append(element('strong', '', title), element('p', '', `${jobTime(job.createdAt)} BDT${job.mode === 'reprint' ? ` · Reprint: ${job.reason}` : ''}`));
      const latest = job.events.at(-1);
      if (latest && latest.action.includes('confirmed')) details.append(element('p', '', `Confirmed ${jobTime(latest.at)} BDT`));
      if (job.result?.results) details.append(element('p', '', job.result.results.map((entry) => `Order ${entry.orderId}: ${entry.result.replaceAll('_', ' ')}`).join(' · ')));
      if (job.error) details.append(element('p', '', job.error));
      const active = ['preparing', 'ready', 'confirmation_pending', 'release_pending'].includes(job.status);
      row.append(details, element('span', `status-pill${active ? ' review' : ''}`, job.status.replaceAll('_', ' ')));
      const actions = element('div', 'history-actions');
      if (active) {
        const button = element('button', 'text-button', 'Open job'); button.type = 'button';
        button.addEventListener('click', async () => {
          if (state.loadingOrders || state.importing || state.downloading || (state.job && state.job.id !== job.id)) return notice('Finish or release the current job first.');
          try { showJob(await jsonRequest(`/fulfillment/jobs/${job.id}`)); $('job-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          catch (error) { notice(error.message); }
        }); actions.append(button);
      } else if (job.status === 'printed' || job.status === 'partial') {
        const button = element('button', 'text-button', 'Reprint…'); button.type = 'button';
        button.addEventListener('click', async () => {
          if (state.loadingOrders || state.importing || state.job || state.downloading) return notice('Finish or release the current job first.');
          const orderIds = job.result?.results?.filter((entry) => ['printed', 'already_printed'].includes(entry.result)).map((entry) => entry.orderId) || [];
          $('queue-filter').value = 'printed';
          await loadOrders(false, orderIds);
          if (!selected().length) notice('These orders are no longer eligible for reprinting, or are on another page. Load printed labels to choose eligible bookings.');
          else { $('reprint-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('reprint-reason').focus(); }
        }); actions.append(button);
      }
      row.append(actions); list.append(row);
    }
  } catch (error) { $('history-list').textContent = `Could not load print history: ${error.message}`; }
}
$('queue-form').addEventListener('submit', (event) => { event.preventDefault(); void loadOrders(); });
$('load-more').addEventListener('click', () => void loadOrders(true));
$('reprint-reason').addEventListener('input', () => updateSummary());
$('confirm-printed').addEventListener('click', () => void jobAction('printed'));
$('release-job').addEventListener('click', () => void jobAction('release'));
$('resume-job').addEventListener('click', () => void jobAction('resume'));
$('refresh-history').addEventListener('click', () => void refreshHistory());
async function connectFulfillment() {
  try {
    const status = await jsonRequest('/fulfillment/status');
    $('queue-date').value = status.today; state.connected = status.configured;
    $('connection-status').textContent = status.configured ? 'Connected' : 'Not connected';
    $('connection-status').classList.toggle('offline', !status.configured);
    $('queue-note').textContent = status.configured ? 'Includes earlier bookings still waiting to be printed.' : 'Set the fulfillment API key on the server to load pending labels. PDF import is available below.';
    await refreshHistory(); if (status.configured) await loadOrders();
  } catch { $('connection-status').textContent = 'Connection unavailable'; $('connection-status').classList.add('offline'); }
  update();
}
void connectFulfillment();
