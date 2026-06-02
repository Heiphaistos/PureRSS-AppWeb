import * as db from "../db/schema";
import { extractGeneric } from "../extractors/generic";
import { extractYoutube } from "../extractors/youtube";
import { extractSocial } from "../extractors/social";
import { extractRss } from "../extractors/rss";
import type { FeedRow } from "../db/schema";

export interface RefreshResult { total: number; inserted: number; }

export async function doRefreshFeed(feed: FeedRow): Promise<RefreshResult> {
  let extracted;
  if (feed.feed_type === "youtube") {
    extracted = await extractYoutube(feed.source_url);
  } else if (feed.feed_type === "social") {
    extracted = await extractSocial(feed.source_url);
  } else if (feed.feed_type === "rss") {
    extracted = await extractRss(feed.source_url);
  } else {
    extracted = await extractGeneric(
      feed.source_url,
      feed.selector_title ?? "h2 a",
      feed.selector_link ?? "h2 a",
      feed.selector_description ?? undefined,
      feed.selector_date ?? undefined,
    );
  }

  const now = new Date().toISOString();
  const items: db.ItemRow[] = extracted.map(e => ({
    id: crypto.randomUUID(),
    feed_id: feed.id,
    title: e.title,
    link: e.link,
    description: e.description ?? null,
    pub_date: e.pub_date ?? null,
    author: e.author ?? null,
    fetched_at: now,
  }));

  const inserted = db.upsertItems(items);
  db.updateFeedStats(feed.id, now, items.length);
  return { total: items.length, inserted };
}
