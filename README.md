# ARVONO Labels

A small label printing service that runs entirely on **Cloudflare Workers** with a **Cloudflare D1** database. Staff pick booked orders from ARVONO, create a **print link**, and send it to a print shop. The shop opens the link, downloads the labels in the format it needs (A4 sheets, label pages or a thermal roll), prints them, and confirms what came out. Reprints always carry a reason.

- **Frontend:** React + [Mantine](https://mantine.dev), served as Workers static assets.
- **API:** a Hono Worker under `/api/*`, talking to the ARVONO dispatch API (`/printable`, `/summary`, `/claim`, `/printed`, `/release`).
- **Database:** D1 stores every print link, the order snapshot it was created with, and an event history (created, reserved, downloaded, printed, released, reprint reason).
- **Labels:** the original PDFKit renderer, ported unchanged to run in the browser. Output is pixel-identical to the previous Node service: same ARVONO design, fonts (Instrument Serif/Sans, Anek Bangla), Code 128 barcode, A4 sheet layout with cut marks and ruler, and thermal presets. PDFs are generated on the print shop's computer, so the Worker never does heavy CPU work.

## How it works

```
Staff dashboard                              Print shop (/p/<token>, no login)
───────────────                              ─────────────────────────────────
Print queue → select labels → Create link    Choose A4 / label pages / thermal
   POST /claim (24 h reservation)             Download PDF (or ZIP of A4 sheets)
   saved in D1 with a share token     ──▶     Untick anything that failed
                                              Confirm printed → POST /printed
Printed tab → select → Request reprint        (unticked labels are released)
   reason required, saved in D1              "Report a problem" → POST /release
```

| Print link status | Meaning |
|---|---|
| Waiting for print | Labels reserved in ARVONO (or a reprint recorded); the shop can download. |
| Printed / Partly printed | The shop confirmed. Labels it unticked went back to ARVONO's queue. |
| Released | Staff or the shop cancelled the link; reserved labels went back to the queue. |
| Expired | ARVONO's 24-hour reservation ran out before confirmation. Release it and create a new link. |
| Failed | None of the labels were still waiting to print. |

Every ARVONO `POST` uses an `Idempotency-Key` stored with the link, so a retry after a network error never reserves or confirms twice. Creating a link is idempotent too (the dashboard sends one UUID per attempt).

### Reprints

ARVONO only accepts `POST /reprint` from a signed-in staff session, not an API key. So reprints are recorded **here**: staff choose printed labels (from **Print queue → Printed · reprint**, or from a finished print link), pick or type a reason (*Label damaged/smudged*, *Printer jam – label lost*, …), and send the reprint link to the shop. The reason is shown to the shop and kept in the link's history. ARVONO's `printCount` isn't changed by these reprints. Labels that staff sent back for reprint in the ARVONO dashboard show up in the normal queue with a **printed ×N** badge.

## Setup

Requires [Bun](https://bun.sh) and a Cloudflare account.

```sh
bun install
bunx wrangler login
bunx wrangler d1 create arvono-labels       # copy the database_id into wrangler.jsonc
bunx wrangler secret put ARVONO_API_KEY      # key with dispatch:read and dispatch:print
bunx wrangler secret put DASHBOARD_PASSWORD  # staff sign-in password
bun run deploy                               # build, apply D1 migrations, deploy
```

`ARVONO_API_BASE_URL` is set in `wrangler.jsonc`.

### Local development

```sh
cp .dev.vars.example .dev.vars    # fill in ARVONO_API_KEY and DASHBOARD_PASSWORD
bun run db:migrate:local
bun run dev                       # http://localhost:5173
```

`bun run test` runs the label renderer tests against PDFKit's browser build; `bun run typecheck` checks the app and Worker.

## Security

- The dashboard needs the `DASHBOARD_PASSWORD`. Sessions are HMAC-signed, HttpOnly cookies; changing the password signs everyone out. For SSO, you can also put the dashboard behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) (leave `/p/*` and `/api/share/*` public).
- Print links are unguessable 144-bit tokens. A link only exposes the labels on it and can only confirm or release those labels.
- The ARVONO API key stays in a Worker secret and is never sent to the browser.
- All `POST`s require an `X-Requested-With: arvono-labels` header, which blocks cross-site form posts.

## Source

```text
worker/
  index.ts       API routes: staff (/api/*) and print shop (/api/share/:token/*)
  requests.ts    Print link workflow on D1: claim, confirm, release, reprint, history
  arvono.ts      ARVONO dispatch API client
  auth.ts        Password sign-in and signed session cookie
migrations/      D1 schema
shared/api.ts    Types shared by the Worker and the app
src/
  labels/        Label renderer (PDFKit, barcode, A4 sheet, thermal presets)
  pages/         Overview, Print queue, Print links, link details, print-shop page
  components/    Tables, format picker, create-link and release dialogs
public/fonts/    Embedded fonts and their SIL licenses
test/            Renderer tests
```
