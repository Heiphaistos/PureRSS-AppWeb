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
  enabled: number; // 0 | 1
  created_at: string;
  last_fetched: string | null;
  item_count: number;
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

export interface Env {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getFeeds(db: D1Database): Promise<FeedRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM feeds ORDER BY created_at DESC")
    .all<FeedRow>();
  return results;
}

export async function getFeed(db: D1Database, id: string): Promise<FeedRow | null> {
  return db.prepare("SELECT * FROM feeds WHERE id = ?").bind(id).first<FeedRow>();
}

export async function insertFeed(db: D1Database, feed: FeedRow): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO feeds
      (id, name, source_url, feed_type, selector_title, selector_link,
       selector_description, selector_date, refresh_interval, enabled,
       created_at, last_fetched, item_count)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    feed.id, feed.name, feed.source_url, feed.feed_type,
    feed.selector_title, feed.selector_link, feed.selector_description, feed.selector_date,
    feed.refresh_interval, feed.enabled, feed.created_at, feed.last_fetched, feed.item_count
  ).run();
}

export async function deleteFeed(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM feeds WHERE id = ?").bind(id).run();
}

export async function toggleFeed(db: D1Database, id: string, enabled: boolean): Promise<void> {
  await db.prepare("UPDATE feeds SET enabled = ? WHERE id = ?").bind(enabled ? 1 : 0, id).run();
}

export async function updateFeedStats(
  db: D1Database, id: string, lastFetched: string, itemCount: number
): Promise<void> {
  await db
    .prepare("UPDATE feeds SET last_fetched = ?, item_count = ? WHERE id = ?")
    .bind(lastFetched, itemCount, id)
    .run();
}

export async function upsertItems(db: D1Database, items: ItemRow[]): Promise<number> {
  if (items.length === 0) return 0;
  let inserted = 0;
  const stmts = items.map(item =>
    db.prepare(`
      INSERT OR IGNORE INTO feed_items
        (id, feed_id, title, link, description, pub_date, author, fetched_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(item.id, item.feed_id, item.title, item.link,
            item.description, item.pub_date, item.author, item.fetched_at)
  );
  // Batch de 20 max (limite D1)
  for (let i = 0; i < stmts.length; i += 20) {
    const batch = stmts.slice(i, i + 20);
    const results = await db.batch(batch);
    inserted += results.filter(r => r.meta.changes > 0).length;
  }
  return inserted;
}

export async function getItems(db: D1Database, feedId: string, limit = 50): Promise<ItemRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM feed_items WHERE feed_id = ? ORDER BY fetched_at DESC LIMIT ?")
    .bind(feedId, limit)
    .all<ItemRow>();
  return results;
}
