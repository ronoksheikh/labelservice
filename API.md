# ARVONO REST API

Live base URL: **http://72.62.255.120:20977**  
Local base URL: **http://127.0.0.1:3000**

Send shipment details as JSON with `Content-Type: application/json`. Successful generation returns the PDF bytes directly (`application/pdf`), ready to save, preview or print. No source PDF upload is needed. The API uses the same renderer, branding, Bangla fonts and automatic address sizing as the web studio.

## Endpoints

| Method and path | JSON body | Successful response |
| --- | --- | --- |
| `POST /generate` | One shipment object | One individual label PDF. Default size: 3 × 3 inches. |
| `POST /batch` | Array of 1–1000 shipments | One PDF with one individual label per page, in input order. |
| `POST /a4` | Array of 1–1000 shipments | One A4 PDF with six exact 3 × 3-inch labels per sheet. |
| `POST /a4?output=zip` | Array of 1–1000 shipments | ZIP containing one PDF per A4 sheet. |
| `POST /thermal?preset=4x6&dpi=203` | One shipment object | One black-on-white thermal label PDF. |
| `POST /thermal/batch?preset=4x6&dpi=203` | Array of 1–1000 shipments | One thermal PDF with one label per page. |
| `GET /thermal/presets` | None | JSON listing supported thermal paper sizes and resolutions. |

For ten shipments, `/a4` returns two A4 pages, `/a4?output=zip` returns two separate A4 PDFs inside a ZIP, and `/batch` returns ten individual label pages in one PDF. For a separate file for every individual label, call `/generate` once per shipment.

## Shipment input

```json
{
  "name": "রাকিব হাসান",
  "phone": "01700000000",
  "address": "বাড়ি ১২, রোড ৭, শান্তিনগর, ঢাকা ১২১৭, বাংলাদেশ",
  "cod": 849,
  "parcelId": "000123456"
}
```

| Field | Type and limits |
| --- | --- |
| `name` | Required non-empty string, up to 160 characters. |
| `phone` | Required non-empty string, up to 40 characters. Use a string to preserve leading zeros. |
| `address` | Required non-empty string, up to 1600 characters. English, Bangla, mixed text and `\n` line breaks are supported. Long details wrap and shrink to fit. |
| `cod` | Required JSON number, 0–999999999.99, up to two decimal places. Printed in taka. Zero is valid. |
| `parcelId` | Required string, 1–80 printable ASCII characters without spaces. Keep leading zeros. Barcode fit also depends on label width. |
| `size` | Optional object: numeric `width`, numeric `height`, and `unit` (`in` or `mm`). Each dimension must be 2–12 inches / 50.8–304.8 mm. |

For a custom individual label, add e.g. `"size": { "width": 4, "height": 6, "unit": "in" }`. `/generate` and `/batch` default to 3 × 3 inches. A batch can contain different individual page sizes.

For `/a4`, omit `size` or use exactly 3 × 3 inches / 76.2 × 76.2 mm. Each A4 page is exactly 210 × 297 mm and holds two columns and three rows. `cutMarks=false` removes the cutting guides; `output=pdf` is the default. Example: `/a4?output=pdf&cutMarks=false`.

Thermal defaults to 4 × 6 inches and 203 dpi. The `dpi` query accepts `203` or `300`; `preset` selects a size listed by `/thermal/presets`. Thermal batches use one stock size. See [README.md](README.md#small-thermal-label-printers) for custom thermal sizing.

## Copyable requests

From the project directory, generate one individual label:

```sh
curl --fail-with-body 'http://72.62.255.120:20977/generate' \
  -H 'Content-Type: application/json' \
  --data-binary @examples/rest/shipment.json \
  --output label.pdf
```

Generate two A4 pages from the included ten-shipment JSON example:

```sh
curl --fail-with-body 'http://72.62.255.120:20977/a4' \
  -H 'Content-Type: application/json' \
  --data-binary @examples/rest/shipments.json \
  --output labels-a4.pdf
```

Generate one PDF with ten individual label pages:

```sh
curl --fail-with-body 'http://72.62.255.120:20977/batch' \
  -H 'Content-Type: application/json' \
  --data-binary @examples/rest/shipments.json \
  --output individual-labels.pdf
```

For separate A4 files, replace `/a4` with `/a4?output=zip` and save as `labels-a4.zip`. The response's `Content-Disposition` header supplies a filename containing the format, label count, Bangladesh date/time and a short ID. ZIP entries include this same prefix plus `sheet-001-of-002.pdf`, etc. Use `curl -OJ` instead of `--output` to save the server-provided filename.

## JavaScript / Bun integration

```js
const shipments = [{
  name: 'রাকিব হাসান',
  phone: '01700000000',
  address: 'শান্তিনগর, ঢাকা, বাংলাদেশ',
  cod: 849,
  parcelId: '000123456',
}];

const response = await fetch('http://72.62.255.120:20977/a4', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(shipments),
});
if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${await response.text()}`);
}
await Bun.write('labels-a4.pdf', await response.arrayBuffer());
```

Read successful responses with `arrayBuffer()` or `blob()`, not `json()`. For a single label, change the path to `/generate` and send one object instead of an array. All generated responses use `Cache-Control: no-store`; the API does not save generated PDFs on the server.

## Errors

Errors return JSON with a non-2xx status. Invalid fields, incorrect body shapes and unsupported options return **400**. A request exceeding the 8 MiB JSON body limit returns **413**. A barcode or fixed payment region that cannot fit returns **422**. Unexpected rendering failures return **500**. Batch requests validate all labels before returning output, so errors do not produce partial PDFs.

```json
{
  "error": "INVALID_INPUT",
  "message": "phone must be a non-empty string of at most 40 characters.",
  "field": "phone",
  "labelIndex": 0
}
```

`labelIndex`, when present, is zero-based. Fields such as `phone` and `parcelId` must be JSON strings, not numbers. `cod` must be a JSON number, not a string. When using `curl --fail-with-body --output`, check its exit status before opening the output file: on failure, that file contains the JSON error body.

## Print and verify

Print at **Actual size / 100%**, one PDF page per paper sheet or stock label. For A4 choose portrait A4 and disable the printer's additional pages-per-sheet setting. Ten 3 × 3-inch labels need two A4 sheets.

```sh
# Public deployment: real JSON requests and PDF/ZIP response verification.
bun run test:rest

# Local restored server (start it with bun run start first):
ARVONO_API_URL=http://127.0.0.1:3000 bun run test:rest

# Build and run the full local test suite:
bun run test
```

The REST smoke test checks actual PDF page counts and physical dimensions, parcel IDs, Bangla and long-address generation, separate A4 ZIP sheets, and a validation error. Results and downloaded files are written under ignored `tmp/pdfs/rest-api/`.

The local application source was pulled from the restored HTTP deployment at `/opt/arvono-labels` on the VPS.

## Connected fulfillment printing

The studio connects to fulfillment through server-only environment settings `FULFILLMENT_API_BASE_URL` and `FULFILLMENT_API_KEY`. It uses HTTP REST calls for label reads, reservations, printing confirmations and releases. It does not call sorting or dispatch endpoints.

| Local endpoint | Purpose |
| --- | --- |
| `GET /fulfillment/status` | Connection configuration and current Dhaka business date. Never returns the key. |
| `GET /fulfillment/orders?upTo=YYYY-MM-DD&status=unprinted` | Pending bookings, including backlog; optional cursor pagination. Use `status=printed` for eligible reprints. |
| `GET /fulfillment/summary?upTo=YYYY-MM-DD` | Fulfillment counts for the selected period. |
| `GET /fulfillment/jobs` | Saved studio print history. |
| `GET /fulfillment/jobs/{id}` | Saved job, labels, status and audit events. |
| `POST /fulfillment/jobs` | Reserve and prepare selected pending labels, or prepare a reasoned local reprint. Requires a UUID `Idempotency-Key` header. |
| `GET /fulfillment/jobs/{id}/file` | Download a ready job's PDF or ZIP without confirming printing. |
| `POST /fulfillment/jobs/{id}/printed` | Confirm actual printing with `{ "orderIds": [12] }`; other reserved orders are released. |
| `POST /fulfillment/jobs/{id}/release` | Release a ready reservation after a failure. Optional `{ "reason": "Printer jam" }`. |
| `POST /fulfillment/jobs/{id}/resume` | Resume an interrupted preparation using its saved request key. |

Example preparation body:

```json
{
  "orderIds": [12, 13],
  "mode": "pending",
  "upTo": "2026-10-19",
  "options": { "format": "a4", "cutMarks": true, "splitSheets": false }
}
```

For a reprint use `"mode": "reprint"` and a required `"reason"` of 3–500 characters. Reprint reasons and confirmations are recorded in studio history only, as requested. Choose `"format": "individual"` with optional `size`, or `"format": "thermal"` with `preset` and `dpi`, for the existing printer formats. At most 500 booked orders can be prepared in one job. The source of the barcode is the courier `consignmentId`, not the invoice or tracking code.

Preparation returns a job JSON object with `id`, `status`, `orders` and `filename`; download the binary from its `/file` endpoint. A successful download does not mark labels printed. Saved history and job files persist under `LABEL_DATA_DIR` / the Docker `label-data` volume.
