import { getDb } from "./schema";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: "user" | "admin";
  created_at: string;
  last_login: string | null;
  token_version: number;
}

export function getUserByEmail(email: string): UserRow | null {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | null;
}

export function getUserById(id: string): UserRow | null {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | null;
}

export function getUserByUsername(username: string): UserRow | null {
  return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | null;
}

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
  return row.cnt;
}

export async function createUser(email: string, username: string, password: string, role: "user" | "admin" = "user"): Promise<UserRow> {
  const password_hash = await bcrypt.hash(password, 12);
  const user: UserRow = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    username: username.trim(),
    password_hash,
    role,
    created_at: new Date().toISOString(),
    last_login: null,
    token_version: 0,
  };
  getDb().prepare(`
    INSERT INTO users (id, email, username, password_hash, role, created_at, last_login, token_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.email, user.username, user.password_hash, user.role, user.created_at, user.last_login, user.token_version);
  return user;
}

export async function verifyPassword(user: UserRow, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
}

export function updateEmail(userId: string, newEmail: string): void {
  getDb().prepare("UPDATE users SET email = ? WHERE id = ?").run(newEmail.toLowerCase().trim(), userId);
}

export function updateLastLogin(userId: string): void {
  getDb().prepare("UPDATE users SET last_login = ? WHERE id = ?").run(new Date().toISOString(), userId);
}

export function incrementTokenVersion(userId: string): void {
  getDb().prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(userId);
}

export function getTokenVersion(userId: string): number {
  const row = getDb().prepare("SELECT token_version FROM users WHERE id = ?").get(userId) as { token_version: number } | null;
  return row?.token_version ?? 0;
}

export function createResetToken(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  getDb().prepare(`
    INSERT INTO reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)
  `).run(token, userId, expires);
  return token;
}

export function consumeResetToken(token: string): string | null {
  const now = new Date().toISOString();
  // Recupere le user_id avant d'invalider pour pouvoir le retourner
  const row = getDb().prepare(`
    SELECT user_id FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > ?
  `).get(token, now) as { user_id: string } | null;
  if (!row) return null;
  // UPDATE atomique -- si used=1 entre-temps, changes=0 et on rejette
  const result = getDb().prepare(
    "UPDATE reset_tokens SET used = 1 WHERE token = ? AND used = 0"
  ).run(token);
  return result.changes > 0 ? row.user_id : null;
}
