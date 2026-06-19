import { Hono } from "hono";
import * as db from "../db/schema";
import { assertPublicUrl } from "../utils/ssrf";
import { doRefreshFeed } from "../utils/refresh";
import { buildRss } from "../rss/builder";
import { sendTestEmbed } from "../utils/discord";
import { requireAuth } from "../middleware/jwt";
import type { JwtPayload } from "../middleware/jwt";

type Vars = { Variables: { user: JwtPayload } };
const app = new Hono<Vars>();

const VALID_TYPES = [
  "generic", "rss", "youtube", "social",
  "instagram", "facebook", "tiktok", "twitter",
  "reddit", "podcast", "twitch",
];

function isDiscordWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.hostname === "discord.com" || u.hostname === "discordapp.com")
        && u.pathname.startsWith("/api/webhooks/");
  } catch { return false; }
}

interface ValidatedFeed {
  name: string; source_url: string; feed_type: string;
  selector_title?: string; selector_link?: string;
  selector_description?: string; selector_date?: string;
  refresh_interval: number;
  discord_webhook: string | null;
}

function validateFeedBody(body: unknown): ValidatedFeed {
  if (typeof body !== "object" || body === null) throw new Error("Corps JSON invalide");
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name) throw new Error("name requis");
  if (typeof b.source_url !== "string" || !b.source_url) throw new Error("source_url requis");
  try { new URL(b.source_url); } catch { throw new Error("source_url invalide"); }
  assertPublicUrl(b.source_url);
  const feed_type = typeof b.feed_type === "string" ? b.feed_type : "generic";
  if (!VALID_TYPES.includes(feed_type)) throw new Error("feed_type invalide");
  const raw_interval = typeof b.refresh_interval === "number" ? b.refresh_interval : 30;
  const refresh_interval = Math.max(5, Math.min(1440, Math.floor(raw_interval)));
  const raw_webhook = typeof b.discord_webhook === "string" ? b.discord_webhook.trim() : "";
  if (raw_webhook && !isDiscordWebhookUrl(raw_webhook)) {
    throw new Error("discord_webhook doit être une URL https://discord.com/api/webhooks/... valide");
  }
  return {
    name: String(b.name).slice(0, 200),
    source_url: b.source_url,
    feed_type,
    selector_title:       typeof b.selector_title === "string"       ? b.selector_title.slice(0, 500)       : undefined,
    selector_link:        typeof b.selector_link === "string"        ? b.selector_link.slice(0, 500)        : undefined,
    selector_description: typeof b.selector_description === "string" ? b.selector_description.slice(0, 500) : undefined,
    selector_date:        typeof b.selector_date === "string"        ? b.selector_date.slice(0, 500)        : undefined,
    refresh_interval,
    discord_webhook: raw_webhook || null,
  };
}

// GET / — liste des feeds de l'utilisateur authentifié
app.get("/", requireAuth, (c) => {
  const owner = c.get("user");
  return c.json(db.getFeeds(owner.sub));
});

// POST / — créer un feed (auth requise)
app.post("/", requireAuth, async (c) => {
  const owner = c.get("user");
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  let v: ValidatedFeed;
  try { v = validateFeedBody(body); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  const feed: db.FeedRow = {
    id: crypto.randomUUID(),
    name: v.name, source_url: v.source_url, feed_type: v.feed_type,
    selector_title: v.selector_title ?? null, selector_link: v.selector_link ?? null,
    selector_description: v.selector_description ?? null, selector_date: v.selector_date ?? null,
    refresh_interval: v.refresh_interval, enabled: 1,
    created_at: new Date().toISOString(), last_fetched: null, item_count: 0,
    discord_webhook: v.discord_webhook,
    owner_id: owner.sub,
  };
  db.insertFeed(feed);
  return c.json(feed, 201);
});

// PATCH /:id/toggle — auth requise + ownership
app.patch("/:id/toggle", requireAuth, (c) => {
  const owner = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "ID manquant" }, 400);
  const feed = db.getFeed(id, owner.sub);
  if (!feed) return c.json({ error: "Flux non trouvé ou accès refusé" }, 404);
  db.toggleFeed(id, owner.sub, feed.enabled === 0);
  return c.json({ ok: true, enabled: feed.enabled === 0 });
});

// PATCH /:id/webhook — auth requise + ownership
app.patch("/:id/webhook", requireAuth, async (c) => {
  const owner = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "ID manquant" }, 400);
  const feed = db.getFeed(id, owner.sub);
  if (!feed) return c.json({ error: "Flux non trouvé ou accès refusé" }, 404);
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  const raw = typeof (body as Record<string, unknown>).discord_webhook === "string"
    ? ((body as Record<string, unknown>).discord_webhook as string).trim() : "";
  if (raw && !isDiscordWebhookUrl(raw)) return c.json({ error: "URL webhook Discord invalide" }, 400);
  db.updateDiscordWebhook(id, owner.sub, raw || null);
  return c.json({ ok: true });
});

// PATCH /:id — auth requise + ownership
app.patch("/:id", requireAuth, async (c) => {
  const owner = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "ID manquant" }, 400);
  const feed = db.getFeed(id, owner.sub);
  if (!feed) return c.json({ error: "Flux non trouvé ou accès refusé" }, 404);
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  let v: ValidatedFeed;
  try { v = validateFeedBody(body); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  const updated: db.FeedRow = {
    ...feed,
    name: v.name, source_url: v.source_url, feed_type: v.feed_type,
    selector_title: v.selector_title ?? null, selector_link: v.selector_link ?? null,
    selector_description: v.selector_description ?? null, selector_date: v.selector_date ?? null,
    refresh_interval: v.refresh_interval,
    discord_webhook: v.discord_webhook,
  };
  db.updateFeed(updated, owner.sub);
  return c.json(updated);
});

// DELETE /:id — auth requise + ownership
app.delete("/:id", requireAuth, (c) => {
  const owner = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "ID manquant" }, 400);
  const deleted = db.deleteFeed(id, owner.sub);
  if (!deleted) return c.json({ error: "Flux non trouvé ou accès refusé" }, 404);
  return c.json({ ok: true });
});

// POST /:id/test-webhook — auth requise + ownership
app.post("/:id/test-webhook", requireAuth, async (c) => {
  const owner = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "ID manquant" }, 400);
  const feed = db.getFeed(id, owner.sub);
  if (!feed) return c.json({ error: "Flux non trouvé ou accès refusé" }, 404);
  if (!feed.discord_webhook) return c.json({ error: "Aucun webhook configuré pour ce flux" }, 400);
  try {
    await sendTestEmbed(feed.discord_webhook, feed.name);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

// POST /:id/refresh — auth requise + ownership
app.post("/:id/refresh", requireAuth, async (c) => {
  const owner = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "ID manquant" }, 400);
  const feed = db.getFeed(id, owner.sub);
  if (!feed) return c.json({ error: "Flux non trouvé ou accès refusé" }, 404);
  try {
    const result = await doRefreshFeed(feed);
    return c.json({ ok: true, ...result });
  } catch (e) { return c.json({ error: `Erreur scraping: ${(e as Error).message}` }, 502); }
});

// GET /:id/items — public (lecture seule)
app.get("/:id/items", (c) => {
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "ID manquant" }, 400);
  const rawLimit = parseInt(c.req.query("limit") ?? "50");
  const limit = isNaN(rawLimit) ? 50 : Math.min(Math.max(1, rawLimit), 200);
  return c.json(db.getItems(id, limit));
});

// GET /:id/rss — public (lecture seule)
app.get("/:id/rss", (c) => {
  const id = c.req.param("id") ?? "";
  if (!id) return c.text("ID manquant", 400);
  const feed = db.getFeedPublic(id);
  if (!feed) return c.text("Flux non trouvé", 404);
  const items = db.getItems(id, 50);
  const xml = buildRss(feed, items);
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
});

export default app;
