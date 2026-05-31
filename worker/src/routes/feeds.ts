import { Hono } from "hono";
import type { Env } from "../db/schema.ts";
import * as db from "../db/schema.ts";
import { extractGeneric } from "../extractors/generic.ts";
import { extractYoutube } from "../extractors/youtube.ts";
import { extractSocial } from "../extractors/social.ts";
import { extractRss } from "../extractors/rss.ts";
import { buildRss } from "../rss/builder.ts";

const app = new Hono<{ Bindings: Env }>();

// Zod n'est pas disponible dans Workers sans bundler — validation manuelle simple
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
  const feed_type = typeof b.feed_type === "string" ? b.feed_type : "generic";
  if (!["generic", "youtube", "social", "rss"].includes(feed_type)) throw new Error("feed_type invalide");
  return {
    name: b.name,
    source_url: b.source_url,
    feed_type,
    selector_title:       typeof b.selector_title === "string"       ? b.selector_title       : undefined,
    selector_link:        typeof b.selector_link === "string"        ? b.selector_link        : undefined,
    selector_description: typeof b.selector_description === "string" ? b.selector_description : undefined,
    selector_date:        typeof b.selector_date === "string"        ? b.selector_date        : undefined,
    refresh_interval:     typeof b.refresh_interval === "number"     ? b.refresh_interval     : 30,
  };
}

// GET /api/feeds
app.get("/", async (c) => {
  const feeds = await db.getFeeds(c.env.DB);
  return c.json(feeds);
});

// POST /api/feeds
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

  await db.insertFeed(c.env.DB, feed);
  return c.json(feed, 201);
});

// DELETE /api/feeds/:id
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const feed = await db.getFeed(c.env.DB, id);
  if (!feed) return c.json({ error: "Flux non trouvé" }, 404);
  await db.deleteFeed(c.env.DB, id);
  return c.json({ ok: true });
});

// PATCH /api/feeds/:id/toggle
app.patch("/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const feed = await db.getFeed(c.env.DB, id);
  if (!feed) return c.json({ error: "Flux non trouvé" }, 404);
  await db.toggleFeed(c.env.DB, id, feed.enabled === 0);
  return c.json({ ok: true, enabled: feed.enabled === 0 });
});

// POST /api/feeds/:id/refresh
app.post("/:id/refresh", async (c) => {
  const id = c.req.param("id");
  const feed = await db.getFeed(c.env.DB, id);
  if (!feed) return c.json({ error: "Flux non trouvé" }, 404);

  let extracted;
  try {
    if (feed.feed_type === "youtube") {
      extracted = await extractYoutube(feed.source_url);
    } else if (feed.feed_type === "social") {
      extracted = await extractSocial(feed.source_url);
    } else if (feed.feed_type === "rss") {
      extracted = await extractRss(feed.source_url);
    } else {
      extracted = await extractGeneric(
        feed.source_url,
        feed.selector_title  ?? "h2 a",
        feed.selector_link   ?? "h2 a",
        feed.selector_description ?? undefined,
        feed.selector_date ?? undefined,
      );
    }
  } catch (e) {
    return c.json({ error: `Erreur scraping: ${(e as Error).message}` }, 502);
  }

  const now = new Date().toISOString();
  const items: db.ItemRow[] = extracted.map(e => ({
    id: crypto.randomUUID(),
    feed_id: id,
    title: e.title,
    link: e.link,
    description: e.description ?? null,
    pub_date: e.pub_date ?? null,
    author: e.author ?? null,
    fetched_at: now,
  }));

  const inserted = await db.upsertItems(c.env.DB, items);
  await db.updateFeedStats(c.env.DB, id, now, items.length);

  return c.json({ ok: true, total: items.length, inserted });
});

// GET /api/feeds/:id/items
app.get("/:id/items", async (c) => {
  const id = c.req.param("id");
  const limit = parseInt(c.req.query("limit") ?? "50");
  const items = await db.getItems(c.env.DB, id, isNaN(limit) ? 50 : limit);
  return c.json(items);
});

// GET /feed/:id (RSS XML)
app.get("/:id/rss", async (c) => {
  const id = c.req.param("id");
  const feed = await db.getFeed(c.env.DB, id);
  if (!feed) return c.text("Flux non trouvé", 404);
  const items = await db.getItems(c.env.DB, id, 50);
  const xml = buildRss(feed, items);
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
});

export default app;
