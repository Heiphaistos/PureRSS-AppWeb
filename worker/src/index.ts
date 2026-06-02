import { Hono } from "hono";
import { cors } from "hono/cors";
import * as db from "./db/schema";
import { buildRss } from "./rss/builder";
import feedsRouter from "./routes/feeds";

const ALLOWED_ORIGINS = new Set([
  "https://purerss.heiphaistos.org",
  "http://localhost:5173",
  "http://localhost:3002",
  "http://127.0.0.1:5173",
]);

// ── Rate limiter ──────────────────────────────────────────────────────────────
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

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use("*", cors({
  origin: (origin) => (!origin ? null : ALLOWED_ORIGINS.has(origin) ? origin : null),
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "X-API-Key"],
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim()
           ?? c.req.header("x-real-ip")
           ?? "unknown";
  if (!checkRateLimit(ip)) return c.json({ error: "Trop de requêtes" }, 429);
  await next();
});

// ── API key auth (mutations uniquement) ───────────────────────────────────────
const API_KEY = process.env.API_KEY ?? "";

app.use("/api/*", async (c, next) => {
  if (!API_KEY || ["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    await next();
    return;
  }
  const key = c.req.header("x-api-key") ?? "";
  if (key !== API_KEY) return c.json({ error: "Clé API invalide" }, 401);
  await next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.route("/api/feeds", feedsRouter);

app.get("/feed/:id", (c) => {
  const id = c.req.param("id");
  const feed = db.getFeed(id);
  if (!feed) return c.text("Flux non trouvé", 404);
  const items = db.getItems(id, 50);
  const xml = buildRss(feed, items);
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
});

app.get("/health", (c) => c.json({ ok: true, service: "PureRSS", version: "1.1.0" }));
app.notFound((c) => c.json({ error: "Route non trouvée" }, 404));

export default app;
