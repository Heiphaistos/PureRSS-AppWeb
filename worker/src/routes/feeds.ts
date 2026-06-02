import { Hono } from "hono";
import * as db from "../db/schema";
import { assertPublicUrl } from "../utils/ssrf";
import { doRefreshFeed } from "../utils/refresh";
import { buildRss } from "../rss/builder";

const app = new Hono();

function validateAddFeed(body: unknown): {
  name: string; source_url: string; feed_type: string;
  selector_title?: string; selector_link?: string;
  selector_description?: string; selector_date?: string;
  refresh_interval: number;
} {
  if (typeof body !== "object" || body === null) throw new Error("Corps JSON invalide");
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name) throw new Error("name requis");
  if (typeof b.source_url !== "string" || !b.source_url) throw new Error("source_url requis");
  try { new URL(b.source_url); } catch { throw new Error("source_url invalide"); }
  assertPublicUrl(b.source_url);
  const feed_type = typeof b.feed_type === "string" ? b.feed_type : "generic";
  if (!["generic", "youtube", "social", "rss"].includes(feed_type)) throw new Error("feed_type invalide");
  const raw_interval = typeof b.refresh_interval === "number" ? b.refresh_interval : 30;
  const refresh_interval = Math.max(5, Math.min(1440, Math.floor(raw_interval)));
  return {
    name: String(b.name).slice(0, 200),
    source_url: b.source_url,
    feed_type,
    selector_title:       typeof b.selector_title === "string"       ? b.selector_title.slice(0, 500)       : undefined,
    selector_link:        typeof b.selector_link === "string"        ? b.selector_link.slice(0, 500)        : undefined,
    selector_description: typeof b.selector_description === "string" ? b.selector_description.slice(0, 500) : undefined,
    selector_date:        typeof b.selector_date === "string"        ? b.selector_date.slice(0, 500)        : undefined,
    refresh_interval,
  };
}

app.get("/", (c) => c.json(db.getFeeds()));

app.post("/", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  let validated;
  try { validated = validateAddFeed(body); } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const feed: db.FeedRow = {
    id: crypto.randomUUID(),
    name: validated.name,
    source_url: validated.source_url,
    feed_type: validated.feed_type,
    selector_title: validated.selector_title ?? null,
    selector_link: validated.selector_link ?? null,
    selector_description: validated.selector_description ?? null,
    selector_date: validated.selector_date ?? null,
    refresh_interval: validated.refresh_interval,
    enabled: 1,
    created_at: new Date().toISOString(),
    last_fetched: null,
    item_count: 0,
  };
  db.insertFeed(feed);
  return c.json(feed, 201);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const feed = db.getFeed(id);
  if (!feed) return c.json({ error: "Flux non trouvé" }, 404);
  db.deleteFeed(id);
  return c.json({ ok: true });
});

app.patch("/:id/toggle", (c) => {
  const id = c.req.param("id");
  const feed = db.getFeed(id);
  if (!feed) return c.json({ error: "Flux non trouvé" }, 404);
  db.toggleFeed(id, feed.enabled === 0);
  return c.json({ ok: true, enabled: feed.enabled === 0 });
});

app.post("/:id/refresh", async (c) => {
  const id = c.req.param("id");
  const feed = db.getFeed(id);
  if (!feed) return c.json({ error: "Flux non trouvé" }, 404);
  try {
    const result = await doRefreshFeed(feed);
    return c.json({ ok: true, ...result });
  } catch (e) {
    return c.json({ error: `Erreur scraping: ${(e as Error).message}` }, 502);
  }
});

app.get("/:id/items", (c) => {
  const id = c.req.param("id");
  const rawLimit = parseInt(c.req.query("limit") ?? "50");
  const limit = isNaN(rawLimit) ? 50 : Math.min(Math.max(1, rawLimit), 200);
  return c.json(db.getItems(id, limit));
});

app.get("/:id/rss", (c) => {
  const id = c.req.param("id");
  const feed = db.getFeed(id);
  if (!feed) return c.text("Flux non trouvé", 404);
  const items = db.getItems(id, 50);
  const xml = buildRss(feed, items);
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
});

export default app;
