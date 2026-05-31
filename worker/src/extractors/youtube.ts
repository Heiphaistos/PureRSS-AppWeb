import type { ExtractedItem } from "./generic.ts";

export async function extractYoutube(sourceUrl: string): Promise<ExtractedItem[]> {
  const rssUrl = await resolveRssUrl(sourceUrl);
  return fetchYoutubeRss(rssUrl);
}

async function resolveRssUrl(url: string): Promise<string> {
  // Déjà un flux RSS YouTube direct
  if (url.includes("feeds/videos.xml")) return url;

  // Format youtube.com/channel/UCxxxxxx
  const channelMatch = url.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelMatch) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
  }

  // Format youtube.com/@username ou youtube.com/c/name → scraper la page pour le channel_id
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw new Error(`YouTube page inaccessible: HTTP ${res.status}`);

  const html = await res.text();

  // Chercher channelId dans le JSON embarqué
  const channelIdMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
  if (channelIdMatch) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
  }

  // Chercher dans les balises link RSS
  const rssMatch = html.match(/href="(https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?[^"]+)"/);
  if (rssMatch) return rssMatch[1];

  throw new Error(`Impossible de résoudre le channel_id YouTube pour: ${url}`);
}

async function fetchYoutubeRss(rssUrl: string): Promise<ExtractedItem[]> {
  const res = await fetch(rssUrl, {
    headers: { "Accept": "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Flux RSS YouTube inaccessible: HTTP ${res.status}`);

  const xml = await res.text();

  // Parser Atom simple (YouTube utilise Atom, pas RSS 2.0)
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

  return entries.map(([, body]) => ({
    title: extractTag(body, "title") ?? "Sans titre",
    link: extractAttr(body, "link", "href") ?? extractTag(body, "yt:videoId")?.replace(/^/, "https://www.youtube.com/watch?v=") ?? "",
    description: extractTag(body, "media:description") ?? extractTag(body, "summary") ?? undefined,
    pub_date: extractTag(body, "published") ?? undefined,
    author: extractTag(body, "name") ?? undefined,
  })).filter(item => item.link);
}

function extractTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
  return m ? (m[1] ?? m[2])?.trim() : undefined;
}

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`));
  return m ? m[1] : undefined;
}
