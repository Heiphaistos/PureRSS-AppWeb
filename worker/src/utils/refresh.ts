import * as db from "../db/schema";
import { extractGeneric } from "../extractors/generic";
import { extractYoutube } from "../extractors/youtube";
import { extractSocial } from "../extractors/social";
import { extractRss } from "../extractors/rss";
import { sendDiscordEmbeds } from "./discord";
import type { FeedRow } from "../db/schema";

export interface RefreshResult { total: number; inserted: number; }

const RSS_TYPES = new Set(["rss", "podcast", "reddit"]);
const SOC_TYPES = new Set(["social", "instagram", "facebook", "tiktok", "twitter"]);

export async function doRefreshFeed(feed: FeedRow): Promise<RefreshResult> {
  let extracted;
  if (feed.feed_type === "youtube") {
    extracted = await extractYoutube(feed.source_url);
  } else if (RSS_TYPES.has(feed.feed_type)) {
    extracted = await extractRss(feed.source_url);
  } else if (SOC_TYPES.has(feed.feed_type)) {
    extracted = await extractSocial(feed.source_url);
  } else {
    // generic, twitch, and any future web-scraping type
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

  const { count: inserted, newItems } = db.upsertItems(items);
  const totalCount = db.getTotalItemCount(feed.id);
  db.updateFeedStats(feed.id, now, totalCount);

  if (inserted > 0 && feed.discord_webhook) {
    sendDiscordEmbeds(feed.discord_webhook, feed, newItems).catch(e =>
      console.error(`[Discord] ${feed.name}: ${e.message}`)
    );
  }

  return { total: items.length, inserted };
}
