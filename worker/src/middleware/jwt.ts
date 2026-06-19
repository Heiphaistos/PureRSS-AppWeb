import { SignJWT, jwtVerify } from "jose";
import type { Context, Next } from "hono";
import * as users from "../db/users";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("[FATAL] JWT_SECRET doit etre defini et avoir au moins 32 caracteres");
}
const SECRET = new TextEncoder().encode(jwtSecret);
const ALGORITHM = "HS256";
const EXPIRY = "7d";

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  role: "user" | "admin";
  tokenVersion: number;
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return c.json({ error: "Non authentifié" }, 401);
  const payload = await verifyJwt(token);
  if (!payload) return c.json({ error: "Token invalide ou expiré" }, 401);
  // Vérifier que le token n'a pas été révoqué (logout ou changement de mot de passe)
  const currentVersion = users.getTokenVersion(payload.sub);
  if (payload.tokenVersion !== currentVersion) {
    return c.json({ error: "Session expirée, veuillez vous reconnecter" }, 401);
  }
  c.set("user", payload);
  await next();
}
