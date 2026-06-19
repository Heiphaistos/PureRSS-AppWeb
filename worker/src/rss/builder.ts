import type { FeedRow, ItemRow } from "../db/schema.ts";

export function buildRss(feed: FeedRow, items: ItemRow[]): string {
  const now = new Date().toUTCString();

  const itemsXml = items.map(item => {
    const pubDate = item.pub_date && !isNaN(Date.parse(item.pub_date))
      ? new Date(item.pub_date).toUTCString()
      : new Date(item.fetched_at || Date.now()).toUTCString();

    return `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      ${item.description ? `<description><![CDATA[${item.description}]]></description>` : ""}
      <pubDate>${pubDate}</pubDate>
      ${item.author ? `<author><![CDATA[${item.author}]]></author>` : ""}
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${feed.name}]]></title>
    <link>${escapeXml(feed.source_url)}</link>
    <description><![CDATA[Flux RSS généré par PureRSS depuis ${feed.source_url}]]></description>
    <language>fr</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>PureRSS v1.1.0</generator>
    ${itemsXml}
  </channel>
</rss>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
