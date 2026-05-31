// URL du Worker CF — injectée par Vite depuis VITE_API_URL
declare const __API_URL__: string;
export const API = __API_URL__;

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
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getFeeds:    () => req<FeedConfig[]>("/api/feeds"),
  addFeed:     (body: object) => req<FeedConfig>("/api/feeds", { method: "POST", body: JSON.stringify(body) }),
  deleteFeed:  (id: string) => req<{ ok: boolean }>(`/api/feeds/${id}`, { method: "DELETE" }),
  toggleFeed:  (id: string) => req<{ ok: boolean; enabled: boolean }>(`/api/feeds/${id}/toggle`, { method: "PATCH" }),
  refreshFeed: (id: string) => req<{ ok: boolean; total: number; inserted: number }>(`/api/feeds/${id}/refresh`, { method: "POST" }),
  getItems:    (id: string, limit = 50) => req<FeedItem[]>(`/api/feeds/${id}/items?limit=${limit}`),
  rssUrl:      (id: string) => `${API}/feed/${id}`,
};
