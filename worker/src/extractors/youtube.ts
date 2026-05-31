import type { ExtractedItem } from "./generic.ts";

export async function extractYoutube(sourceUrl: string): Promise<ExtractedItem[]> {
  const rssUrl = await resolveRssUrl(sourceUrl);
  return fetchYoutubeRss(rssUrl);
}

async function resolveRssUrl(url: string): Promise<string> {
  if (url.includes("feeds/videos.xml")) return url;

  const channelMatch = url.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelMatch) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`YouTube page inaccessible: HTTP ${res.status}`);

  const html = await res.text();

  const channelIdMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
  if (channelIdMatch) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
  }

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
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

  return entries.map(([, body]) => {
    const videoId   = extractSimpleTag(body, "yt:videoId");
    const title     = extractCdata(body, "title") ?? extractSimpleTag(body, "title") ?? "Sans titre";
    const link      = extractAttrVal(body, "link", "href") ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
    const desc      = extractMediaDescription(body);
    const pub_date  = extractSimpleTag(body, "published");
    const author    = extractSimpleTag(body, "name");
    const thumbnail = extractAttrVal(body, "media:thumbnail", "url");

    return { title, link, description: desc, pub_date, author, thumbnail } as ExtractedItem & { thumbnail?: string };
  }).filter(item => !!item.link);
}

// ── Helpers XML ───────────────────────────────────────────────────────────────

// Extrait du contenu CDATA ou texte brut d'une balise
function extractCdata(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${escRe(tag)}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${escRe(tag)}>`, "i");
  return xml.match(re)?.[1]?.trim();
}

function extractSimpleTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${escRe(tag)}[^>]*>([\\s\\S]*?)</${escRe(tag)}>`, "i");
  const m  = xml.match(re);
  if (!m) return undefined;
  // Nettoyer CDATA si présent
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() || undefined;
}

function extractAttrVal(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${escRe(tag)}[^>]*\\s${escRe(attr)}="([^"]+)"`, "i");
  return xml.match(re)?.[1];
}

// media:description est dans media:group — on cherche dans tout le body
function extractMediaDescription(body: string): string | undefined {
  // Chercher le bloc media:group
  const groupMatch = body.match(/<media:group>([\s\S]*?)<\/media:group>/i);
  const searchIn   = groupMatch?.[1] ?? body;

  // Chercher media:description (avec ou sans CDATA)
  const cdataMatch = searchIn.match(/<media:description[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/media:description>/i);
  if (cdataMatch?.[1]?.trim()) return truncate(cdataMatch[1].trim(), 400);

  const plainMatch = searchIn.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/i);
  if (plainMatch?.[1]?.trim()) return truncate(plainMatch[1].trim(), 400);

  return undefined;
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(":", "\\:");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
