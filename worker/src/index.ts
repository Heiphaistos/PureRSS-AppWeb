import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import * as db from "./db/schema";
import { buildRss } from "./rss/builder";
import feedsRouter from "./routes/feeds";
import authRouter from "./routes/auth";

const ALLOWED_ORIGINS = new Set([
  "https://purerss.heiphaistos.org",
  "http://localhost:5173",
  "http://localhost:3002",
  "http://127.0.0.1:5173",
]);

// Fix PB-1 : X-Real-IP (setté par nginx avec $remote_addr, non-injectable)
// en priorité sur X-Forwarded-For
function getClientIp(c: Context): string {
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}

// Fix PB-2/PB-3 : rate limits composites par endpoint
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, e] of rateLimitMap) if (now > e.resetAt) rateLimitMap.delete(key);
}, 5 * 60_000);

const app = new Hono();

app.use("*", cors({
  origin: (origin) => (!origin ? null : ALLOWED_ORIGINS.has(origin) ? origin : null),
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Middleware global : rate limit general (120 req/min)
app.use("*", async (c, next) => {
  const ip = getClientIp(c);
  if (!checkRateLimit(`global:${ip}`, 120, 60_000))
    return c.json({ error: "Trop de requêtes" }, 429);
  return await next();
});

// Rate limits stricts sur les endpoints auth sensibles
app.use("/api/auth/login", async (c, next) => {
  const ip = getClientIp(c);
  if (c.req.method === "POST" && !checkRateLimit(`auth_login:${ip}`, 5, 15 * 60_000))
    return c.json({ error: "Trop de tentatives de connexion, réessayez dans 15 minutes" }, 429);
  return await next();
});

app.use("/api/auth/register", async (c, next) => {
  const ip = getClientIp(c);
  if (c.req.method === "POST" && !checkRateLimit(`auth_reg:${ip}`, 3, 60 * 60_000))
    return c.json({ error: "Trop d'inscriptions depuis cette IP, réessayez dans 1 heure" }, 429);
  return await next();
});

app.use("/api/auth/forgot-password", async (c, next) => {
  const ip = getClientIp(c);
  if (c.req.method === "POST" && !checkRateLimit(`auth_forgot:${ip}`, 3, 60 * 60_000))
    return c.json({ error: "Trop de demandes de réinitialisation, réessayez dans 1 heure" }, 429);
  return await next();
});

// Routes auth — publiques
app.route("/api/auth", authRouter);

// Flux RSS public (lecture seule, sans auth)
app.get("/feed/:id", (c) => {
  const id = c.req.param("id") ?? "";
  if (!id) return c.text("ID manquant", 400);
  const feed = db.getFeedPublic(id);
  if (!feed) return c.text("Flux non trouvé", 404);
  const items = db.getItems(id, 50);
  const xml = buildRss(feed, items);
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
});

// Auth gérée directement dans feedsRouter (requireAuth par route)
app.route("/api/feeds", feedsRouter);

app.get("/health", (c) => c.json({ ok: true, service: "PureRSS", version: "1.2.0" }));
app.notFound((c) => c.json({ error: "Route non trouvée" }, 404));

export default app;
