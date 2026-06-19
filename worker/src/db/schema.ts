import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export interface FeedRow {
  id: string;
  name: string;
  source_url: string;
  feed_type: string;
  selector_title: string | null;
  selector_link: string | null;
  selector_description: string | null;
  selector_date: string | null;
  refresh_interval: number;
  enabled: number;
  created_at: string;
  last_fetched: string | null;
  item_count: number;
  discord_webhook: string | null;
}

export interface ItemRow {
  id: string;
  feed_id: string;
  title: string;
  link: string;
  description: string | null;
  pub_date: string | null;
  author: string | null;
  fetched_at: string;
}

let _db: Database.Database;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DB_PATH ?? "./data/purerss.db";
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    _initSchema(_db);
  }
  return _db;
}

function _initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      source_url           TEXT NOT NULL,
      feed_type            TEXT NOT NULL DEFAULT 'generic',
      selector_title       TEXT,
      selector_link        TEXT,
      selector_description TEXT,
      selector_date        TEXT,
      refresh_interval     INTEGER NOT NULL DEFAULT 30,
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
  `);
  const cols = db.prepare("PRAGMA table_info(feeds)").all() as { name: string }[];
  if (!cols.some(c => c.name === "discord_webhook")) {
    db.exec("ALTER TABLE feeds ADD COLUMN discord_webhook TEXT");
  }

  // Users & reset tokens
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      created_at    TEXT NOT NULL,
      last_login    TEXT
    );
    CREATE TABLE IF NOT EXISTS reset_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

export function getFeeds(): FeedRow[] {
  return getDb().prepare("SELECT * FROM feeds ORDER BY created_at DESC").all() as FeedRow[];
}

export function getFeed(id: string): FeedRow | null {
  return getDb().prepare("SELECT * FROM feeds WHERE id = ?").get(id) as FeedRow | null;
}

export function insertFeed(feed: FeedRow): void {
  getDb().prepare(`
    INSERT INTO feeds
      (id, name, source_url, feed_type, selector_title, selector_link,
       selector_description, selector_date, refresh_interval, enabled,
       created_at, last_fetched, item_count, discord_webhook)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    feed.id, feed.name, feed.source_url, feed.feed_type,
    feed.selector_title, feed.selector_link, feed.selector_description, feed.selector_date,
    feed.refresh_interval, feed.enabled, feed.created_at, feed.last_fetched,
    feed.item_count, feed.discord_webhook,
  );
}

export function updateFeed(feed: FeedRow): void {
  getDb().prepare(`
    UPDATE feeds SET
      name = ?, source_url = ?, feed_type = ?,
      selector_title = ?, selector_link = ?,
      selector_description = ?, selector_date = ?,
      refresh_interval = ?, discord_webhook = ?
    WHERE id = ?
  `).run(
    feed.name, feed.source_url, feed.feed_type,
    feed.selector_title, feed.selector_link, feed.selector_description, feed.selector_date,
    feed.refresh_interval, feed.discord_webhook,
    feed.id,
  );
}

export function deleteFeed(id: string): void {
  getDb().prepare("DELETE FROM feeds WHERE id = ?").run(id);
}

export function toggleFeed(id: string, enabled: boolean): void {
  getDb().prepare("UPDATE feeds SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function updateFeedStats(id: string, lastFetched: string, itemCount: number): void {
  getDb().prepare("UPDATE feeds SET last_fetched = ?, item_count = ? WHERE id = ?")
    .run(lastFetched, itemCount, id);
}

export function updateDiscordWebhook(id: string, webhook: string | null): void {
  getDb().prepare("UPDATE feeds SET discord_webhook = ? WHERE id = ?").run(webhook, id);
}

export function upsertItems(items: ItemRow[]): { count: number; newItems: ItemRow[] } {
  if (items.length === 0) return { count: 0, newItems: [] };
  const insert = getDb().prepare(`
    INSERT OR IGNORE INTO feed_items
      (id, feed_id, title, link, description, pub_date, author, fetched_at)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const upsertMany = getDb().transaction((rows: ItemRow[]) => {
    const newItems: ItemRow[] = [];
    for (const item of rows) {
      const result = insert.run(
        item.id, item.feed_id, item.title, item.link,
        item.description, item.pub_date, item.author, item.fetched_at,
      );
      if (result.changes > 0) newItems.push(item);
    }
    return newItems;
  });
  const newItems = upsertMany(items) as ItemRow[];
  return { count: newItems.length, newItems };
}

export function getTotalItemCount(feedId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as cnt FROM feed_items WHERE feed_id = ?")
    .get(feedId) as { cnt: number };
  return row.cnt;
}

export function getItems(feedId: string, limit = 50): ItemRow[] {
  return getDb()
    .prepare(`
      SELECT * FROM feed_items
      WHERE feed_id = ?
      ORDER BY
        CASE WHEN pub_date LIKE '____-__-__%' THEN pub_date ELSE fetched_at END DESC,
        fetched_at DESC
      LIMIT ?
    `)
    .all(feedId, limit) as ItemRow[];
}
