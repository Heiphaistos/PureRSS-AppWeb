import { SignJWT, jwtVerify } from "jose";
import type { Context, Next } from "hono";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "changeme-in-prod-32chars-minimum"
);
const ALGORITHM = "HS256";
const EXPIRY = "7d";

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  role: "user" | "admin";
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
  c.set("user", payload);
  await next();
}
