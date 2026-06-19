declare const __API_URL__: string;
export const API = __API_URL__;

export function getToken(): string {
  return localStorage.getItem("purerss-token") ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem("purerss-token", token);
}

export function clearToken(): void {
  localStorage.removeItem("purerss-token");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export interface FeedConfig {
  id: string; name: string; source_url: string; feed_type: string;
  selector_title: string | null; selector_link: string | null;
  selector_description: string | null; selector_date: string | null;
  refresh_interval: number; enabled: number; created_at: string;
  last_fetched: string | null; item_count: number; discord_webhook: string | null;
}

export interface FeedItem {
  id: string; feed_id: string; title: string; link: string;
  description: string | null; pub_date: string | null;
  author: string | null; fetched_at: string;
}

export interface UserProfile {
  id: string; email: string; username: string; role: string;
  last_login: string | null; created_at: string;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login:          (email: string, password: string) =>
    req<{ token: string; user: UserProfile }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register:       (email: string, username: string, password: string) =>
    req<{ token: string; user: UserProfile }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, username, password }) }),
  me:             () => req<UserProfile>("/api/auth/me"),
  forgotPassword: (email: string) =>
    req<{ ok: boolean; message: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword:  (token: string, password: string) =>
    req<{ ok: boolean }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  changePassword: (current_password: string, new_password: string) =>
    req<{ ok: boolean }>("/api/auth/change-password", { method: "PATCH", body: JSON.stringify({ current_password, new_password }) }),
  changeEmail:    (email: string, password: string) =>
    req<{ ok: boolean }>("/api/auth/change-email", { method: "PATCH", body: JSON.stringify({ email, password }) }),

  getFeeds:      () => req<FeedConfig[]>("/api/feeds"),
  addFeed:       (body: object) => req<FeedConfig>("/api/feeds", { method: "POST", body: JSON.stringify(body) }),
  updateFeed:    (id: string, body: object) => req<FeedConfig>(`/api/feeds/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteFeed:    (id: string) => req<{ ok: boolean }>(`/api/feeds/${id}`, { method: "DELETE" }),
  toggleFeed:    (id: string) => req<{ ok: boolean; enabled: boolean }>(`/api/feeds/${id}/toggle`, { method: "PATCH" }),
  refreshFeed:   (id: string) => req<{ ok: boolean; total: number; inserted: number }>(`/api/feeds/${id}/refresh`, { method: "POST" }),
  getItems:      (id: string, limit = 50) => req<FeedItem[]>(`/api/feeds/${id}/items?limit=${limit}`),
  updateWebhook: (id: string, discord_webhook: string | null) =>
    req<{ ok: boolean }>(`/api/feeds/${id}/webhook`, { method: "PATCH", body: JSON.stringify({ discord_webhook }) }),
  testWebhook:   (id: string) => req<{ ok: boolean }>(`/api/feeds/${id}/test-webhook`, { method: "POST" }),
  rssUrl:        (id: string) => `${API}/feed/${id}`,
};
