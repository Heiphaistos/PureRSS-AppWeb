import { parse, type HTMLElement } from "node-html-parser";
import { extractRss, parseAnyFeed } from "./rss.ts";
import { assertPublicUrl } from "../utils/ssrf";

export interface ExtractedItem {
  title: string;
  link: string;
  description?: string;
  pub_date?: string;
  author?: string;
}

const RSS_CONTENT_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
];

function isRssContentType(ct: string): boolean {
  return RSS_CONTENT_TYPES.some(t => ct.toLowerCase().includes(t));
}

function discoverFeedUrl(html: string, base: URL): string | null {
  const re = /<link[^>]+rel=["']alternate["'][^>]+>/gi;
  for (const match of html.matchAll(re)) {
    const tag = match[0];
    if (!/type=["'](application\/(rss|atom)\+xml|text\/xml)/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try { return new URL(href, base).toString(); } catch { /**/ }
  }
  const re2 = /<link[^>]+type=["'](application\/(rss|atom)\+xml|text\/xml)["'][^>]*>/gi;
  for (const match of html.matchAll(re2)) {
    const href = match[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try { return new URL(href, base).toString(); } catch { /**/ }
  }
  return null;
}

const AUTO_CONTAINERS = [
  "article", ".post", ".entry", ".article", ".card", ".item",
  ".news-item", ".blog-post", ".feed-item", "li.post", "li.entry",
];

const TITLE_SELECTORS = ["h1 a", "h2 a", "h3 a", ".title a", ".post-title a", ".entry-title a", "h1", "h2", "h3"];
const DESC_SELECTORS  = [".excerpt", ".summary", ".description", ".intro", ".content p", "p"];

export async function extractGeneric(
  sourceUrl: string,
  selectorTitle: string,
  selectorLink: string,
  selectorDescription?: string,
  selectorDate?: string,
): Promise<ExtractedItem[]> {
  assertPublicUrl(sourceUrl);
  const { html, contentType } = await fetchRaw(sourceUrl);

  if (isRssContentType(contentType)) return parseAnyFeed(html);

  const base = new URL(sourceUrl);
  const isDefault = selectorTitle === "h2 a" && selectorLink === "h2 a";

  if (!isDefault) {
    const root = parse(html);
    return extractWithSelectors(root, base, selectorTitle, selectorLink, selectorDescription, selectorDate);
  }

  const feedUrl = discoverFeedUrl(html, base);
  if (feedUrl) {
    try {
      const items = await extractRss(feedUrl);
      if (items.length > 0) return items;
    } catch { /**/ }
  }

  const root = parse(html);
  for (const containerSel of AUTO_CONTAINERS) {
    const containers = root.querySelectorAll(containerSel);
    if (containers.length >= 2) {
      const items = extractFromContainers(containers, base, selectorDate);
      if (items.length > 0) return items;
    }
  }

  return extractFallback(root, base, sourceUrl);
}

function extractWithSelectors(
  root: HTMLElement, base: URL,
  selTitle: string, selLink: string, selDesc?: string, selDate?: string,
): ExtractedItem[] {
  const titleEls = root.querySelectorAll(selTitle);
  const linkEls  = root.querySelectorAll(selLink);
  const descEls  = selDesc ? root.querySelectorAll(selDesc) : [];
  const dateEls  = selDate ? root.querySelectorAll(selDate) : [];
  const items: ExtractedItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.min(titleEls.length, linkEls.length); i++) {
    const title = titleEls[i].text.trim();
    const href  = linkEls[i].getAttribute("href") ?? linkEls[i].text.trim();
    if (!title || !href) continue;
    const link = resolveUrl(base, href);
    if (seen.has(link)) continue;
    seen.add(link);
    items.push({
      title, link,
      description: descEls[i]?.text.trim() || undefined,
      pub_date: dateEls[i]?.getAttribute("datetime") || dateEls[i]?.text.trim() || undefined,
    });
  }
  return items;
}

function extractFromContainers(containers: HTMLElement[], base: URL, selDate?: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const seen = new Set<string>();
  for (const container of containers) {
    let title = "", link = "";
    for (const sel of TITLE_SELECTORS) {
      const el = container.querySelector(sel);
      if (!el) continue;
      const t = el.text.trim();
      const h = el.getAttribute("href") ?? el.querySelector("a")?.getAttribute("href") ?? "";
      if (t && h) { title = t; link = resolveUrl(base, h); break; }
      if (t && !h) {
        title = t;
        const a = container.querySelector("a");
        if (a) link = resolveUrl(base, a.getAttribute("href") ?? "");
        if (title && link) break;
      }
    }
    if (!title || !link || seen.has(link)) continue;
    if (isNavigationLink(link, base)) continue;
    seen.add(link);
    let description: string | undefined;
    for (const sel of DESC_SELECTORS) {
      const el = container.querySelector(sel);
      if (el) {
        const t = el.text.trim();
        if (t.length > 20 && t !== title) {
          description = t.length > 300 ? t.slice(0, 297) + "…" : t;
          break;
        }
      }
    }
    let pub_date: string | undefined;
    if (selDate) {
      const el = container.querySelector(selDate);
      pub_date = el?.getAttribute("datetime") || el?.text.trim() || undefined;
    } else {
      const timeEl = container.querySelector("time");
      pub_date = timeEl?.getAttribute("datetime") || timeEl?.text.trim() || undefined;
    }
    items.push({ title, link, description, pub_date });
  }
  return items;
}

function extractFallback(root: HTMLElement, base: URL, sourceUrl: string): ExtractedItem[] {
  const seen = new Set<string>();
  const items: ExtractedItem[] = [];
  const anchors = root.querySelectorAll("h2 a, h3 a, h4 a, .title a");
  for (const a of anchors) {
    const title = a.text.trim();
    const href  = a.getAttribute("href") ?? "";
    if (!title || !href) continue;
    const link = resolveUrl(base, href);
    if (!link.startsWith("http") || seen.has(link)) continue;
    if (isNavigationLink(link, base)) continue;
    seen.add(link);
    items.push({ title, link });
  }
  if (items.length === 0) {
    const ogTitle = root.querySelector("meta[property='og:title']")?.getAttribute("content")
                 ?? root.querySelector("title")?.text.trim()
                 ?? "Page sans titre";
    const ogDesc  = root.querySelector("meta[property='og:description']")?.getAttribute("content")
                 ?? root.querySelector("meta[name='description']")?.getAttribute("content")
                 ?? undefined;
    items.push({ title: ogTitle, link: sourceUrl, description: ogDesc });
  }
  return items;
}

async function fetchRaw(url: string): Promise<{ html: string; contentType: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return { html: await res.text(), contentType: res.headers.get("content-type") ?? "" };
}

function resolveUrl(base: URL, href: string): string {
  if (!href) return "";
  try { return new URL(href).toString(); } catch { /**/ }
  try { return new URL(href, base.origin).toString(); } catch { /**/ }
  return href;
}

function rootDomain(hostname: string): string {
  const parts = hostname.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
}

function isNavigationLink(link: string, base: URL): boolean {
  try {
    const u = new URL(link);
    if (u.pathname === "/" || u.pathname === base.pathname) return true;
    if (rootDomain(u.hostname) !== rootDomain(base.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}
