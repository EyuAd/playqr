CREATE TABLE IF NOT EXISTS links (
  code TEXT PRIMARY KEY, owner_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('app','collection')),
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', ids TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  total INTEGER NOT NULL DEFAULT 0, last_scanned TEXT
);
CREATE INDEX IF NOT EXISTS links_owner_created ON links(owner_hash, created_at DESC);
CREATE TABLE IF NOT EXISTS scan_daily (
  code TEXT NOT NULL REFERENCES links(code) ON DELETE CASCADE,
  day TEXT NOT NULL, device TEXT NOT NULL, browser TEXT NOT NULL, country TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(code, day, device, browser, country)
);
CREATE INDEX IF NOT EXISTS scan_day ON scan_daily(day);

