import { serve } from "@hono/node-server";
import { getDb } from "./db/schema";
import { doRefreshFeed } from "./utils/refresh";
import type { FeedRow } from "./db/schema";
import app from "./index";

getDb();

const port = parseInt(process.env.PORT ?? "3002");
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`[PureRSS] API running on http://0.0.0.0:${info.port}`);
  startAutoRefresh();
});

function startAutoRefresh(): void {
  setInterval(async () => {
    const db = getDb();
    const feeds = db.prepare(
      `SELECT * FROM feeds WHERE enabled = 1
       AND (last_fetched IS NULL
            OR CAST((julianday('now') - julianday(last_fetched)) * 1440 AS INTEGER) >= refresh_interval)`
    ).all() as FeedRow[];

    for (const feed of feeds) {
      try {
        const { inserted } = await doRefreshFeed(feed);
        if (inserted > 0) console.log(`[AutoRefresh] ${feed.name}: +${inserted} items`);
      } catch (e) {
        console.error(`[AutoRefresh] ${feed.name}: ${(e as Error).message}`);
      }
    }
  }, 60_000);
}
