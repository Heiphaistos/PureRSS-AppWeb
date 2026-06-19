import { getDb } from "./schema";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
  last_login: string | null;
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

export async function createUser(email: string, username: string, password: string, role = "user"): Promise<UserRow> {
  const password_hash = await bcrypt.hash(password, 12);
  const user: UserRow = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    username: username.trim(),
    password_hash,
    role,
    created_at: new Date().toISOString(),
    last_login: null,
  };
  getDb().prepare(`
    INSERT INTO users (id, email, username, password_hash, role, created_at, last_login)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.email, user.username, user.password_hash, user.role, user.created_at, user.last_login);
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

export function createResetToken(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  getDb().prepare(`
    INSERT INTO reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)
  `).run(token, userId, expires);
  return token;
}

export function consumeResetToken(token: string): string | null {
  const row = getDb().prepare(`
    SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > ?
  `).get(token, new Date().toISOString()) as { user_id: string } | null;
  if (!row) return null;
  getDb().prepare("UPDATE reset_tokens SET used = 1 WHERE token = ?").run(token);
  return row.user_id;
}
