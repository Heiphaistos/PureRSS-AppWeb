-- Migration initiale PureRSS
CREATE TABLE IF NOT EXISTS feeds (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  source_url TEXT NOT NULL,
  feed_type  TEXT NOT NULL DEFAULT 'generic',
  selector_title       TEXT,
  selector_link        TEXT,
  selector_description TEXT,
  selector_date        TEXT,
  refresh_interval INTEGER NOT NULL DEFAULT 30,
  enabled              INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL,
  last_fetched         TEXT,
  item_count           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feed_items (
  id          TEXT PRIMARY KEY,
  feed_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  link        TEXT NOT NULL,
  description TEXT,
  pub_date    TEXT,
  author      TEXT,
  fetched_at  TEXT NOT NULL,
  FOREIGN KEY(feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_link    ON feed_items(feed_id, link);
CREATE        INDEX IF NOT EXISTS idx_items_fetched ON feed_items(feed_id, fetched_at DESC);
