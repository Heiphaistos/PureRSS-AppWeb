import { parse } from "node-html-parser";

export interface ExtractedItem {
  title: string;
  link: string;
  description?: string;
  pub_date?: string;
  author?: string;
}

export async function extractGeneric(
  sourceUrl: string,
  selectorTitle: string,
  selectorLink: string,
  selectorDescription?: string,
  selectorDate?: string,
): Promise<ExtractedItem[]> {
  const res = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} sur ${sourceUrl}`);
  }

  const html = await res.text();
  const root = parse(html);
  const base = new URL(sourceUrl);

  const titleEls = root.querySelectorAll(selectorTitle);
  const linkEls  = root.querySelectorAll(selectorLink);
  const descEls  = selectorDescription ? root.querySelectorAll(selectorDescription) : [];
  const dateEls  = selectorDate ? root.querySelectorAll(selectorDate) : [];

  const items: ExtractedItem[] = [];
  const max = Math.min(titleEls.length, linkEls.length);

  for (let i = 0; i < max; i++) {
    const titleEl = titleEls[i];
    const linkEl  = linkEls[i];

    const title = titleEl.text.trim();
    const href  = linkEl.getAttribute("href") ?? linkEl.text.trim();
    if (!title || !href) continue;

    const link = resolveUrl(base, href);
    const description = descEls[i]?.text.trim() || undefined;
    const pub_date    = dateEls[i]?.getAttribute("datetime") || dateEls[i]?.text.trim() || undefined;

    items.push({ title, link, description, pub_date });
  }

  return items;
}

function resolveUrl(base: URL, href: string): string {
  try {
    return new URL(href).toString();
  } catch {
    try {
      return new URL(href, base.origin).toString();
    } catch {
      return href;
    }
  }
}
