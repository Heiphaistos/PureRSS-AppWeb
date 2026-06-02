import type { ExtractedItem } from "./generic.ts";
import { assertPublicUrl } from "../utils/ssrf";

export async function extractRss(rssUrl: string): Promise<ExtractedItem[]> {
  assertPublicUrl(rssUrl);
  const res = await fetch(rssUrl, {
    headers: {
      "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Flux RSS inaccessible: HTTP ${res.status}`);
  const xml = await res.text();
  return parseAnyFeed(xml);
}

export function parseAnyFeed(xml: string): ExtractedItem[] {
  if (/<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)) return parseAtom(xml);
  return parseRss2(xml);
}

function parseRss2(xml: string): ExtractedItem[] {
  const items = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)];
  return items.map(([, body]) => {
    const title  = cdataOrTag(body, "title") ?? "Sans titre";
    const link   = rssLink(body);
    const desc   = cdataOrTag(body, "content:encoded") ?? cdataOrTag(body, "description");
    const pub_date = simpleTag(body, "pubDate") ?? simpleTag(body, "dc:date");
    const author   = cdataOrTag(body, "author") ?? cdataOrTag(body, "dc:creator");
    return {
      title,
      link,
      description: desc ? truncate(stripHtml(desc), 400) : undefined,
      pub_date,
      author,
    };
  }).filter(i => !!i.link);
}

function rssLink(body: string): string {
  const textLink = body.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1]?.trim();
  if (textLink && textLink.startsWith("http")) return textLink;
  const attrLink = body.match(/<link[^>]*\shref="([^"]+)"/i)?.[1];
  if (attrLink) return attrLink;
  const guid = body.match(/<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/i)?.[1]?.trim();
  if (guid && guid.startsWith("http")) return guid;
  const guidPlain = body.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1]?.trim();
  if (guidPlain?.startsWith("http")) return guidPlain;
  return "";
}

function parseAtom(xml: string): ExtractedItem[] {
  const entries = [...xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)];
  return entries.map(([, body]) => {
    const title  = cdataOrTag(body, "title") ?? "Sans titre";
    const link   = body.match(/<link[^>]*\srel="alternate"[^>]*\shref="([^"]+)"/i)?.[1]
                ?? body.match(/<link[^>]*\shref="([^"]+)"[^>]*\srel="alternate"/i)?.[1]
                ?? body.match(/<link[^>]*\shref="([^"]+)"/i)?.[1]
                ?? "";
    const desc   = cdataOrTag(body, "content") ?? cdataOrTag(body, "summary");
    const pub_date = simpleTag(body, "published") ?? simpleTag(body, "updated");
    const author   = simpleTag(body, "name");
    return {
      title,
      link,
      description: desc ? truncate(stripHtml(desc), 400) : undefined,
      pub_date,
      author,
    };
  }).filter(i => !!i.link);
}

function cdataOrTag(xml: string, tag: string): string | undefined {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(":", "\\:");
  const c = xml.match(new RegExp(`<${esc}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\/${esc}>`, "i"));
  if (c?.[1]?.trim()) return c[1].trim();
  const t = xml.match(new RegExp(`<${esc}[^>]*>([^<]*)<\/${esc}>`, "i"));
  return t?.[1]?.trim() || undefined;
}

function simpleTag(xml: string, tag: string): string | undefined {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(":", "\\:");
  const m = xml.match(new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\/${esc}>`, "i"));
  if (!m) return undefined;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() || undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ").trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
