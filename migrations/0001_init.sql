-- A print request is one shareable link. "new" requests reserve labels in ARVONO
-- (POST /claim); "reprint" requests are local and always carry a reason.
CREATE TABLE print_requests (
  id              TEXT PRIMARY KEY,
  token           TEXT NOT NULL UNIQUE,
  mode            TEXT NOT NULL CHECK (mode IN ('new', 'reprint')),
  note            TEXT,
  reason          TEXT,
  status          TEXT NOT NULL,
  upstream_job_id TEXT,
  expires_at      TEXT,
  claim_key       TEXT NOT NULL,
  confirm_key     TEXT NOT NULL,
  release_key     TEXT NOT NULL,
  requested_ids   TEXT NOT NULL,
  orders          TEXT NOT NULL DEFAULT '[]',
  printed_ids     TEXT,
  release_reason  TEXT,
  error           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (mode = 'new' OR length(reason) >= 3)
);
CREATE INDEX print_requests_created ON print_requests (created_at DESC);

CREATE TABLE print_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT NOT NULL REFERENCES print_requests (id),
  action      TEXT NOT NULL,
  actor       TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX print_events_request ON print_events (request_id, id);
