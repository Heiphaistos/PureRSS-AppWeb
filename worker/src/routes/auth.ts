import { Hono } from "hono";
import * as users from "../db/users";
import { signJwt, requireAuth } from "../middleware/jwt";
import { sendPasswordResetEmail } from "../utils/email";
import type { JwtPayload } from "../middleware/jwt";

type Vars = { Variables: { user: JwtPayload } };
const app = new Hono<Vars>();
const APP_URL = process.env.APP_URL ?? "https://purerss.heiphaistos.org";

// POST /api/auth/register
app.post("/register", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.toLowerCase().trim() : "";
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return c.json({ error: "Email invalide" }, 400);
  if (!username || username.length < 3 || username.length > 30 || !/^[a-zA-Z0-9_-]+$/.test(username))
    return c.json({ error: "Nom d'utilisateur : 3-30 caractères alphanumériques, _ ou -" }, 400);
  if (!password || password.length < 8 || password.length > 128)
    return c.json({ error: "Mot de passe : 8 à 128 caractères" }, 400);
  if (users.getUserByEmail(email)) return c.json({ error: "Email déjà utilisé" }, 409);
  if (users.getUserByUsername(username)) return c.json({ error: "Nom d'utilisateur déjà pris" }, 409);
  const isFirst = users.countUsers() === 0;
  const user = await users.createUser(email, username, password, isFirst ? "admin" : "user");
  const token = await signJwt({ sub: user.id, email: user.email, username: user.username, role: user.role, tokenVersion: user.token_version });
  return c.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } }, 201);
});

// POST /api/auth/login
app.post("/login", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.toLowerCase().trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !password) return c.json({ error: "Email et mot de passe requis" }, 400);
  const user = users.getUserByEmail(email);
  if (!user || !(await users.verifyPassword(user, password)))
    return c.json({ error: "Email ou mot de passe incorrect" }, 401);
  users.updateLastLogin(user.id);
  const token = await signJwt({ sub: user.id, email: user.email, username: user.username, role: user.role, tokenVersion: user.token_version ?? 0 });
  return c.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
});

// GET /api/auth/me
app.get("/me", requireAuth, (c) => {
  const u = c.get("user") as JwtPayload;
  const user = users.getUserById(u.sub);
  if (!user) return c.json({ error: "Utilisateur non trouvé" }, 404);
  return c.json({ id: user.id, email: user.email, username: user.username, role: user.role, last_login: user.last_login, created_at: user.created_at });
});

// POST /api/auth/logout
app.post("/logout", requireAuth, (c) => {
  const u = c.get("user") as JwtPayload;
  users.incrementTokenVersion(u.sub);
  return c.json({ ok: true });
});

// POST /api/auth/forgot-password
app.post("/forgot-password", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  const email = typeof (body as Record<string, unknown>).email === "string"
    ? ((body as Record<string, unknown>).email as string).toLowerCase().trim() : "";
  const user = email ? users.getUserByEmail(email) : null;
  if (user) {
    const token = users.createResetToken(user.id);
    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl).catch(e =>
      console.error("[Auth] Erreur envoi email:", e.message));
  }
  return c.json({ ok: true, message: "Si cet email existe, un lien vous a été envoyé." });
});

// POST /api/auth/reset-password
app.post("/reset-password", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  const b = body as Record<string, unknown>;
  const token = typeof b.token === "string" ? b.token : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!token || !password) return c.json({ error: "Token et mot de passe requis" }, 400);
  if (password.length < 8 || password.length > 128) return c.json({ error: "Mot de passe : 8 à 128 caractères" }, 400);
  const userId = users.consumeResetToken(token);
  if (!userId) return c.json({ error: "Token invalide ou expiré" }, 400);
  await users.updatePassword(userId, password);
  // Invalider tous les tokens existants après reset
  users.incrementTokenVersion(userId);
  return c.json({ ok: true, message: "Mot de passe mis à jour avec succès." });
});

// PATCH /api/auth/change-password
app.patch("/change-password", requireAuth, async (c) => {
  const u = c.get("user") as JwtPayload;
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  const b = body as Record<string, unknown>;
  const current = typeof b.current_password === "string" ? b.current_password : "";
  const next = typeof b.new_password === "string" ? b.new_password : "";
  if (!current || !next) return c.json({ error: "Champs requis" }, 400);
  if (next.length < 8 || next.length > 128) return c.json({ error: "Nouveau mot de passe : 8 à 128 caractères" }, 400);
  const user = users.getUserById(u.sub);
  if (!user || !(await users.verifyPassword(user, current)))
    return c.json({ error: "Mot de passe actuel incorrect" }, 401);
  await users.updatePassword(u.sub, next);
  // Invalider tous les tokens existants (autres sessions)
  users.incrementTokenVersion(u.sub);
  // Réémettre un nouveau token pour la session courante
  const updatedUser = users.getUserById(u.sub)!;
  const newToken = await signJwt({
    sub: u.sub, email: updatedUser.email, username: updatedUser.username,
    role: updatedUser.role, tokenVersion: updatedUser.token_version,
  });
  return c.json({ ok: true, token: newToken });
});

// PATCH /api/auth/change-email
app.patch("/change-email", requireAuth, async (c) => {
  const u = c.get("user") as JwtPayload;
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON invalide" }, 400); }
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.toLowerCase().trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return c.json({ error: "Email invalide" }, 400);
  const user = users.getUserById(u.sub);
  if (!user || !(await users.verifyPassword(user, password)))
    return c.json({ error: "Mot de passe incorrect" }, 401);
  const existing = users.getUserByEmail(email);
  if (existing && existing.id !== u.sub) return c.json({ error: "Email déjà utilisé" }, 409);
  users.updateEmail(u.sub, email);
  return c.json({ ok: true });
});

export default app;
