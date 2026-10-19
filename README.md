# ARVONO shipping labels

A web studio and REST API for premium shipping labels, running locally or in Docker on your server. Drop courier PDFs into the studio, review the extracted details beside the original, then download ARVONO labels for A4 paper or a label printer. TypeScript, Node.js, Fastify, PDFKit, PDF.js and bwip-js, with fflate for separate-sheet ZIP downloads. Text, dividers and Code 128 bars are vector objects. The ARVONO wordmark uses Instrument Serif; English details use Instrument Sans; Bangla names, addresses, phone numbers and the taka symbol use Anek Bangla. All fonts are embedded locally.

**REST integration:** [API reference and copyable requests](API.md). Send raw shipment JSON to `POST /generate`, `/batch` or `/a4` and receive PDF bytes directly. The public base URL is **http://72.62.255.120:20977**. Example inputs are in `examples/rest/`; `bun run test:rest` verifies the live deployment.

## Pending labels and reprints

Set `FULFILLMENT_API_BASE_URL` and `FULFILLMENT_API_KEY` in the server's private `.env` file. The studio loads pending courier bookings through today's Asia/Dhaka business date, including earlier unprinted bookings. Choose A4, individual or thermal output and prepare the selected labels. Preparation reserves labels and downloads the PDF; after physical printing, select the labels that printed and click **Confirm printed**. Unselected labels are released. **Release unprinted labels** returns a failed job to the pending pool.

Choose **Printed labels / reprints** to print again with a required reason. Reprint reasons and confirmations are saved in this studio's print history; reprints do not reset fulfillment's printed state. The studio never calls sorting or dispatch endpoints. The API key stays on the server. PDFs and ZIP sheets have filenames containing format, label count, Bangladesh date/time and a short job ID. Print history uses `LABEL_DATA_DIR` (default `./data`); Docker preserves it in the `label-data` volume.

## Run

Requires Node.js 22.13+ (or Node.js 24+) and Bun.

```sh
bun install --frozen-lockfile
bun run build
bun run start
```

Open **http://127.0.0.1:3000** for the studio. Stop with Ctrl+C. For development, use `bun run dev` (Bun watch mode). Production startup runs the compiled JavaScript on Node.js. The buildless web UI is served by the same server. `HOST` and `PORT` configure the listener; local defaults are `127.0.0.1` and `3000`. There is no database or authentication.

## Docker deployment

```sh
cp .env.example .env
docker compose up -d --build --wait
docker compose ps
```

`APP_PORT` in `.env` sets the public port (default **20977**), mapped to port 3000 inside the container. Open `http://YOUR_SERVER_IP:20977`. The Docker build uses Bun 1.3.10 for dependency installation and compilation, runs the full test suite, and creates a Node.js 24 runtime with the embedded fonts and offline OCR models. It excludes local uploads, generated PDFs, logs and development dependencies.

The service runs as an unprivileged user with a read-only filesystem, temporary memory storage, a health check, bounded log files, and automatic restart after failures or server reboots. Update it by copying the changed source into the deployment directory and running `docker compose up -d --build --wait` again. View logs with `docker compose logs --tail=100 studio`; stop only this app with `docker compose down`.

The VPS installation lives in `/opt/arvono-labels` and is available at **http://72.62.255.120:20977**.

## Import a courier PDF

1. Drop one or more PDFs onto the upload area, or choose them with the file picker.
2. Select a parcel to review its SF-ID, recipient name, phone, delivery address and COD. SF-ID becomes the parcel ID; the invoice number stays separate. Leading zeros are preserved. Source area information is included in the address when it is not already present. Invoice, area and courier notes remain available in the editor for reference; notes are not added to the printed label.
3. Successfully recovered Bangla is marked **Fixed** and passes automatically, with no review checkbox. You can edit fields or open **Original PDF** at any time. Missing values, still-unreadable text and duplicate selected parcel IDs require correction or deselection.
4. Choose A4 sheets (six exact 3 × 3-inch labels per sheet), individual premium labels, or thermal labels. Preview the actual generated label or A4 sheet, then download a PDF or separate A4 PDFs in a ZIP.

The importer targets text-based Steadfast PDFs with **one courier label per page**. It extracts known field anchors deterministically; PDF content is treated only as data. Scanned or unrecognized pages need manual entry and an explicit review check. Pages containing multiple courier labels are flagged for re-export with one label per page.

Some PDFs display Bangla correctly but have incomplete Unicode mappings or extract vowel signs in the wrong order. The importer preserves dependent marks and conjuncts while joining text, normalizes Unicode to NFC, and detects obvious broken Bangla clusters. For an affected recipient field it scans **every wrapped Bangla line**, keeping commas and other punctuation in the phrase. It reads the full value-column width so a font reporting zero width for a visible conjunct cannot cut off the end of a line. **Local Bengali + English OCR** runs at two image scales, with a third-scale retry for uncertain readings; spatial coverage favors complete readings, and the clearest version of each physical word is combined across scales. One low-confidence proper noun no longer rejects a complete long address. Readable Latin runs, house/postal numbers, SF-ID, phone and COD stay directly extracted. The bundled models occupy about 4.1 MiB, are checked against SHA-256 hashes, and require no network access during import. An OCR worker starts only when needed and closes after the PDF is imported.

Successful OCR recovery is accepted automatically when the resulting fields pass validation. The original PDF and editable fields remain available. OCR can make spelling mistakes; automatic acceptance is a workflow setting, not a guarantee of transcription accuracy. Unrecoverable text stays marked `�` for manual correction. Scanned whole-page OCR is not included. Anek Bangla controls the generated label's appearance; changing the output font cannot reconstruct missing characters in a source PDF. Model provenance and licenses are in `assets/ocr/README.md`.

Importing retains the complete address. Long recipient details automatically wrap and shrink to fit the selected label, including 3 × 3-inch labels on A4. The renderer chooses the largest fitting recipient text scale, preserves every address line, and keeps the label dimensions, payment details and barcode geometry unchanged.

Files are sent to the running app server: your own computer for a local installation, or your VPS for a hosted installation. PDF parsing and OCR run on that server without an external OCR service. Files and edits stay in memory; reload, close or Clear all discards the browser workspace. The API does not write uploaded or generated files to disk. Each PDF can be up to **10 MiB / 500 pages**, and a workspace can contain up to **1,000 labels**. Browser JavaScript and fonts are served by the app, with no CDN dependency.

For direct integration, **`POST /import/pdf`** accepts the raw PDF bytes with `Content-Type: application/pdf`:

```sh
curl --fail-with-body http://127.0.0.1:3000/import/pdf \
  -H 'Content-Type: application/pdf' \
  --data-binary @courier-labels.pdf
```

The JSON response is `{ pageCount, labels }`. Each label contains its one-based `page`, editable `fields` (`parcelId`, `name`, `phone`, `address`, `cod`), `metadata` and `issues`. An optional `recovery` array records each recovered field, its original damaged value, recovered text, method (`local-ocr`) and model confidence. Recovered fields pass automatically when valid; confidence is a ranking signal, not a probability of correctness. Missing COD is `null`, distinct from a valid zero amount. An issue contains `field`, `code` and `message`. A bad PDF returns HTTP 400, a password-protected file returns `ENCRYPTED_PDF`, and an oversized request returns HTTP 413. Labels are generated when the fields are submitted to a label endpoint.

## Single label

```sh
curl --fail-with-body http://127.0.0.1:3000/generate \
  -H 'Content-Type: application/json' \
  --data '{
    "name": "Rakib",
    "phone": "01780282878",
    "address": "Jibonnagar, Chuadanga, Bangladesh",
    "cod": 849,
    "parcelId": "309479004",
    "size": { "width": 3, "height": 3, "unit": "in" }
  }' \
  --output label.pdf
```

Returns `application/pdf` directly. Omitting `size` gives a 3 × 3-inch page. Custom pages use physical PDF points (72/inch), including 4 × 3 inches or `{ "width": 100, "height": 75, "unit": "mm" }`. Each dimension must be 2–12 inches (50.8–304.8 mm); content must also fit that size. Width and height are never swapped automatically.

## Batch labels

`POST /batch` accepts an array of 1–1000 shipment objects. Each object can have its own size. The result is one PDF with exactly one label per shipment, in input order. All content is validated and fitted before any PDF is returned.

```sh
curl --fail-with-body http://127.0.0.1:3000/batch \
  -H 'Content-Type: application/json' \
  --data '[
    { "name": "Rakib", "phone": "01780282878", "address": "Jibonnagar, Chuadanga, Bangladesh", "cod": 849, "parcelId": "309479004" },
    { "name": "রাকিব হাসান", "phone": "01780282878", "address": "শান্তিনগর, ঢাকা, বাংলাদেশ", "cod": 1200, "parcelId": "000309479005", "size": { "width": 4, "height": 3, "unit": "in" } }
  ]' \
  --output labels.pdf
```

For an existing JSON array file, replace `--data '…'` with `--data-binary @shipments.json`. Request bodies may be up to 8 MiB. The renderer yields between groups of 25 labels so a large batch does not monopolize the event loop for the entire request. PDFs are buffered in memory to keep failed requests atomic; nothing is saved by the API. All responses use `Cache-Control: no-store`.

## Print multiple labels on A4 paper

**`POST /a4`** accepts the same array of 1–1000 shipments as `/batch`. It places **six labels on each A4 sheet**, in two columns and three rows, ordered left to right and then top to bottom. Each label is exactly **3 × 3 inches (76.2 × 76.2 mm / 216 × 216 PDF points)**. The A4 page is exactly **210 × 297 mm**, portrait, with 5 mm gaps and centered outer margins of 26.3 mm horizontally and 29.2 mm vertically.

Labels are drawn directly as vectors onto the sheet with translation only. They keep their original physical size. Blank positions on the final sheet stay white, and there are no extra blank pages.

| Number of labels | A4 sheets needed |
| --- | --- |
| 1–6 | 1 |
| 7–12 | 2 |
| 13–18 | 3 |
| 500 | 84 |

Ten labels therefore need **two A4 sheets**. Choose either one PDF containing both pages, or a ZIP download containing two separate one-page PDFs.

```sh
# First, create the example file containing ten shipments:
bun run samples:a4

# One PDF with two A4 pages:
curl --fail-with-body http://127.0.0.1:3000/a4 \
  -H 'Content-Type: application/json' \
  --data-binary @output/arvono-a4-shipments.json \
  --output labels-a4.pdf

# Two separate A4 PDFs, packaged as one ZIP download:
curl --fail-with-body 'http://127.0.0.1:3000/a4?output=zip' \
  -H 'Content-Type: application/json' \
  --data-binary @output/arvono-a4-shipments.json \
  --output labels-a4.zip
```

| Query parameter | Values | Default |
| --- | --- | --- |
| `output` | `pdf` for one multi-page PDF; `zip` for one PDF per sheet. | `pdf` |
| `cutMarks` | `true` or `false`, for cutting guides outside each occupied label. | `true` |

For example, use `/a4?output=pdf&cutMarks=false` to hide the guides. ZIP entries include the label count, Bangladesh date/time, a short ID, and sheet numbers, preserving shipment order.

Omit each shipment's `size`, or set it to exactly 3 × 3 inches or 76.2 × 76.2 mm. Other dimensions return HTTP 400. Recipient details automatically shrink to fit each 3-inch label. An overlong barcode returns HTTP 422 with its zero-based `labelIndex`, before any PDF or ZIP is returned.

In the print dialog choose **A4**, **portrait**, **one PDF page per paper sheet**, and **Actual size / 100%**. Turn off Fit, Shrink, and the printer's multiple-pages-per-sheet option. A one-inch reference line is printed below the labels: it must measure exactly **25.4 mm** with a ruler. Cut at the short crop marks; each finished label measures **76.2 × 76.2 mm**.

## Small thermal label printers

Thermal endpoints produce **black text and bars on white paper**, with the Instrument Serif wordmark and Anek Bangla for Bangla text. Each PDF page is one label at its exact stock size. Text and barcodes remain vector artwork. Captions use bold black type, important details stay inside a margin of at least 5 mm, and barcode quiet zones are preserved.

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /thermal/presets` | No body. | Available sizes, default preset, and supported barcode DPI profiles. |
| `POST /thermal` | One shipment object, as for `/generate`. | A single-label PDF. |
| `POST /thermal/batch` | An array of 1–1000 shipments, as for `/batch`. | One PDF page per label, in input order. |

Select a preset with `?preset=...`. The default is **4 × 6 inches** if you omit both the preset and the shipment's size.

| Preset | Physical paper size |
| --- | --- |
| `4x6` | 4 × 6 inches (101.6 × 152.4 mm). |
| `3x3` | 3 × 3 inches (76.2 × 76.2 mm). |
| `100x150mm` | 100 × 150 mm. |
| `100x100mm` | 100 × 100 mm. |
| `100x75mm` | 100 × 75 mm. |
| `80x100mm` | 80 × 100 mm. |
| `62x100mm` | 62 × 100 mm. |
| `58x100mm` | 58 × 100 mm. |

The width is listed first. A 4 × 6-inch label and a 100 × 150 mm label are different sizes; choose the one printed on your stock packaging. The narrow-roll presets use a fixed 100 mm page length; a custom `size` can set a different length.

```sh
# Generate thermal sample files and an example shipment JSON:
bun run samples:thermal

# One 4 × 6-inch thermal label, with a 203 dpi barcode profile:
curl --fail-with-body 'http://127.0.0.1:3000/thermal?preset=4x6&dpi=203' \
  -H 'Content-Type: application/json' \
  --data-binary @output/arvono-thermal-request.json \
  --output thermal-label.pdf

# A roll-printing job of ten 3 × 3-inch labels:
bun run samples:a4
curl --fail-with-body 'http://127.0.0.1:3000/thermal/batch?preset=3x3&dpi=300' \
  -H 'Content-Type: application/json' \
  --data-binary @output/arvono-a4-shipments.json \
  --output thermal-labels.pdf
```

The optional `dpi` query is `203` (default) or `300`. Select the value matching your printer. Bar widths and positions use whole dots at the selected resolution, with a minimum physical narrow-module width of about 0.25 mm (at least two dots at 203 dpi, or three dots at 300 dpi); the page itself remains an exact physical vector PDF.

For custom stock, omit `preset` and supply `size` on the shipment (2–12 inches per dimension, in inches or millimeters). In a batch, the first shipment sets the stock size; subsequent shipments inherit it when `size` is omitted. All explicit sizes must match. Selecting a preset also requires all explicit shipment sizes to match it. Recipient details shrink automatically. A stock mismatch returns HTTP 400 with `labelIndex`; barcodes or fixed payment regions that cannot fit return HTTP 422. The API validates the whole job before returning a PDF.

Print the PDF through your printer's installed operating-system driver. Set the driver paper size to the exact label dimensions, choose **Actual size / 100%**, **one page per label**, and calibrate the roll's gap or black-mark sensor using the printer's settings. Check the model's supported paper width and printable area when choosing a preset; paper sizes alone do not identify a printer model. Printing and feeding have to be checked on the actual hardware once its model is known.

## Fields and errors

| Field | Requirement |
| --- | --- |
| `name` | Non-empty string, at most 160 characters. |
| `phone` | Non-empty string, at most 40 characters. Keep leading zeros in the string. |
| `address` | Non-empty string, at most 1600 characters. English, Bangla, mixed text and explicit newlines supported. |
| `cod` | JSON number from 0 to 999999999.99, with up to two decimal places. Printed in taka. |
| `parcelId` | String of 1–80 printable ASCII characters without spaces. Actual usable length depends on label width and barcode density. Leading zeros are preserved. |
| `size` | Optional object containing numeric `width`, numeric `height`, and `unit` (`in` or `mm`). |

Invalid fields return HTTP **400**. Text wraps at words and, for long unbroken strings, Unicode grapheme boundaries. Recipient fonts and spacing automatically shrink as far as needed to fit, with no fixed minimum font size; content is never truncated. Barcodes and fixed payment regions retain their sizing checks and return HTTP **422** when they cannot fit. Numeric identifiers are rejected instead of silently converting them to strings.

```json
{
  "error": "BARCODE_DOES_NOT_FIT",
  "message": "parcelId is too long for a reliably scannable barcode at this width. Use a wider label or shorter parcelId.",
  "field": "parcelId",
  "labelIndex": 1
}
```

`labelIndex` is zero-based; layout errors include it even for a single label. Errors before layout identify the invalid field; batch errors also identify the shipment index. Unexpected rendering failures return a generic HTTP 500 and log the details locally.

## Print

Choose the page's exact paper size and **Actual size / 100%** in the PDF print dialog. Disable fit-to-page and printer-added headers or margins. The PDF has zero page margins and a full-bleed `#111111` background; its internal spacing is intentional. Physical edge printing depends on the printer's printable area.

The barcode uses genuine Code 128 data from bwip-js, drawn as black PDF rectangles on a white panel. It reserves at least 10 narrow modules of white quiet zone on each side, at least two dots per narrow module at 203 dpi, and at least 18 pt of bar height. Overlong IDs return `BARCODE_DOES_NOT_FIT`. Print at 100% to preserve these dimensions. Dark backgrounds need a printer and stock that can reproduce them; ordinary direct thermal printing renders the dark area as solid printed black.

## Samples and verification

```sh
bun run samples
bun run samples:a4
bun run samples:thermal
bun run test
```

`bun run samples` writes:

- `output/arvono-sample.pdf` — 3 × 3 inches.
- `output/arvono-sample-4x3.pdf` — 4 × 3 inches.

`bun run samples:a4` writes the example shipment JSON, `output/arvono-a4-10-labels.pdf` (two A4 pages), `output/arvono-a4-10-labels.zip`, and two single-page PDFs under `output/a4-sheets/`.

`bun run samples:thermal` writes `output/arvono-thermal-4x6.pdf`, `output/arvono-thermal-3x3.pdf`, `output/arvono-thermal-58x100mm.pdf`, and an example request JSON. Thermal PNG previews are included alongside these PDFs.

PNG previews of both samples are also included in `output/`. To regenerate previews with Poppler:

```sh
pdftoppm -scale-to 1080 -png -singlefile output/arvono-sample.pdf output/arvono-sample
pdftoppm -scale-to 1440 -png -singlefile output/arvono-sample-4x3.pdf output/arvono-sample-4x3
```

`bun run test` compiles the project and runs Node's built-in test runner. It exercises all endpoints, PDF importing, wrapped addresses, Bangla mark/conjunct joining, automatic acceptance after real offline OCR of deliberately damaged Unicode mappings, four-line Bangla address recovery, uncertain proper nouns, full-line coverage, leading zeros, zero and comma-formatted COD amounts, locked/invalid files, static assets, 500-label batches, A4 pagination and physical geometry, ZIP extraction, thermal preset dimensions, monochrome artwork, printer-dot barcode alignment, stock-size validation, Bangla text, long addresses, invalid input and fit errors. The test PDFs go in ignored `tmp/pdfs/`. No Python tools, Poppler or external OCR services are needed to run the API or its tests.

## Source

```text
src/
  index.ts      Local listener and graceful shutdown
  routes.ts     Endpoints and JSON error responses
  label.ts      Measured layout, typography and PDF rendering
  barcode.ts    Code 128 encoding and vector bars
  sheet.ts      Exact A4 grid, cutting guides and ruler check
  thermal.ts    Thermal paper presets and roll-job validation
  import.ts     Positional courier PDF extraction and review issues
  pdf-text.ts   Shared field/row parsing and Bangla text checks
  bangla.ts     Local OCR recovery of damaged recipient text
  ocr-words.ts  Complete-reading selection and merging words across OCR scales
  web.ts        Local web assets and raw-PDF import endpoint
  types.ts      Shipment types, validation and dimensions
web/            Drag-and-drop studio, editor and PDF.js previews
assets/fonts/   Embedded fonts and their SIL licenses
assets/ocr/     Bundled, verified Bengali/English OCR models and license
scripts/        Sample generation
test/           API integration tests
output/         Sample PDFs and PNG previews
```

Font sources and license notes are in `assets/fonts/README.md`. See [PDFKit text documentation](https://pdfkit.org/docs/text.html) and [bwip-js raw encoding documentation](https://github.com/metafloor/bwip-js/wiki/Methods-Reference#bwipjsraw) for the underlying rendering APIs.
