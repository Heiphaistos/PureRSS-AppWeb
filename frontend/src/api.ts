declare const __API_URL__: string;
export const API = __API_URL__;

function getApiKey(): string {
  return localStorage.getItem("purerss-api-key") ?? "";
}

export function setApiKey(key: string): void {
  localStorage.setItem("purerss-api-key", key);
}

export interface FeedConfig {
  id: string;
  name: string;
  source_url: string;
  feed_type: string;
  selector_title: string | null;
  selector_link: string | null;
  selector_description: string | null;
  selector_date: string | null;
  refresh_interval: number;
  enabled: number;
  created_at: string;
  last_fetched: string | null;
  item_count: number;
  discord_webhook: string | null;
}

export interface FeedItem {
  id: string;
  feed_id: string;
  title: string;
  link: string;
  description: string | null;
  pub_date: string | null;
  author: string | null;
  fetched_at: string;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const key = getApiKey();
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
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
