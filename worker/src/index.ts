import { Hono } from "hono";
import { cors } from "hono/cors";
import * as db from "./db/schema";
import { buildRss } from "./rss/builder";
import feedsRouter from "./routes/feeds";

const app = new Hono();

app.use("*", cors({
  origin: (origin) => {
    if (!origin) return "*";
    if (
      origin.includes("purerss") ||
      origin.includes("heiphaistos.org") ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1")
    ) {
      return origin;
    }
    return null;
  },
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

app.route("/api/feeds", feedsRouter);

app.get("/feed/:id", (c) => {
  const id = c.req.param("id");
  const feed = db.getFeed(id);
  if (!feed) return c.text("Flux non trouvé", 404);
  const items = db.getItems(id, 50);
  const xml = buildRss(feed, items);
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
});

app.get("/health", (c) => c.json({ ok: true, service: "PureRSS", version: "1.0.0" }));

app.notFound((c) => c.json({ error: "Route non trouvée" }, 404));

export default app;
