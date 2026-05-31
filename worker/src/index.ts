import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./db/schema.ts";
import * as db from "./db/schema.ts";
import { buildRss } from "./rss/builder.ts";
import feedsRouter from "./routes/feeds.ts";

const app = new Hono<{ Bindings: Env }>();

// CORS — autoriser le frontend CF Pages + localhost dev
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return "*";
    if (
      origin.includes("purerss") ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.includes(".pages.dev")
    ) {
      return origin;
    }
    return null;
  },
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

// API REST
app.route("/api/feeds", feedsRouter);

// Route RSS publique /feed/:id (pour les lecteurs RSS externes)
app.get("/feed/:id", async (c) => {
  const id = c.req.param("id");
  const feed = await db.getFeed(c.env.DB, id);
  if (!feed) return c.text("Flux non trouvé", 404);
  const items = await db.getItems(c.env.DB, id, 50);
  const xml = buildRss(feed, items);
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
});

// Health check
app.get("/health", (c) => c.json({ ok: true, service: "PureRSS Worker", version: "1.0.0" }));

app.notFound((c) => c.json({ error: "Route non trouvée" }, 404));

export default app;
