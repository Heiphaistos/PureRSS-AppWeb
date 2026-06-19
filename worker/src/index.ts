import { Hono } from "hono";
import { cors } from "hono/cors";
import * as db from "./db/schema";
import { buildRss } from "./rss/builder";
import feedsRouter from "./routes/feeds";
import authRouter from "./routes/auth";
import { requireAuth } from "./middleware/jwt";

const ALLOWED_ORIGINS = new Set([
  "https://purerss.heiphaistos.org",
  "http://localhost:5173",
  "http://localhost:3002",
  "http://127.0.0.1:5173",
]);

const rateLimitMap = new Map<string, { count: number; reset: number }>();

function checkRateLimit(ip: string, max = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of rateLimitMap) if (now > e.reset) rateLimitMap.delete(ip);
}, 5 * 60_000);

const app = new Hono();

app.use("*", cors({
  origin: (origin) => (!origin ? null : ALLOWED_ORIGINS.has(origin) ? origin : null),
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim()
           ?? c.req.header("x-real-ip") ?? "unknown";
  if (!checkRateLimit(ip)) return c.json({ error: "Trop de requêtes" }, 429);
  return await next();
});

// Routes auth — publiques
app.route("/api/auth", authRouter);

// Flux RSS public (lecture seule, sans auth)
app.get("/feed/:id", (c) => {
  const id = c.req.param("id");
  const feed = db.getFeed(id);
  if (!feed) return c.text("Flux non trouvé", 404);
  const items = db.getItems(id, 50);
  const xml = buildRss(feed, items);
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
});

// GET feeds — public (pour lecteurs RSS externes)
app.get("/api/feeds", (c) => feedsRouter.fetch(c.req.raw));
app.get("/api/feeds/:id/items", (c) => feedsRouter.fetch(c.req.raw));
app.get("/api/feeds/:id/rss", (c) => feedsRouter.fetch(c.req.raw));

// Toutes les autres routes feeds — JWT requis
app.use("/api/feeds/*", requireAuth);
app.route("/api/feeds", feedsRouter);

app.get("/health", (c) => c.json({ ok: true, service: "PureRSS", version: "1.2.0" }));
app.notFound((c) => c.json({ error: "Route non trouvée" }, 404));

export default app;
