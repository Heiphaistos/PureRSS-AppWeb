import type { FeedRow, ItemRow } from "../db/schema";

const EMBED_COLORS: Record<string, number> = {
  generic: 0x58a6ff,
  rss:     0x56d364,
  youtube: 0xf85149,
  social:  0xdb61a2,
};

interface DiscordEmbed {
  title: string;
  url: string;
  description?: string;
  color: number;
  timestamp?: string;
  footer: { text: string };
  author?: { name: string };
}

function buildEmbed(feed: FeedRow, item: ItemRow): DiscordEmbed {
  const color = EMBED_COLORS[feed.feed_type] ?? 0x5865f2;
  const embed: DiscordEmbed = {
    title: item.title.length > 256 ? item.title.slice(0, 253) + "…" : item.title,
    url: item.link,
    color,
    footer: { text: `PureRSS • ${feed.name}` },
  };
  if (item.description) {
    embed.description = item.description.length > 300
      ? item.description.slice(0, 297) + "…"
      : item.description;
  }
  if (item.pub_date) {
    try {
      const d = new Date(item.pub_date);
      if (!isNaN(d.getTime())) embed.timestamp = d.toISOString();
    } catch { /* ignore */ }
  }
  if (item.author) embed.author = { name: item.author };
  return embed;
}

async function postToWebhook(url: string, body: object): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function sendDiscordEmbeds(
  webhookUrl: string,
  feed: FeedRow,
  items: ItemRow[],
): Promise<void> {
  const BATCH = 10;
  for (let i = 0; i < items.length; i += BATCH) {
    const embeds = items.slice(i, i + BATCH).map(item => buildEmbed(feed, item));
    try {
      await postToWebhook(webhookUrl, { embeds });
      if (i + BATCH < items.length) await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`[Discord] ${feed.name}: ${(e as Error).message}`);
    }
  }
}

export async function sendTestEmbed(webhookUrl: string, feedName: string): Promise<void> {
  await postToWebhook(webhookUrl, {
    embeds: [{
      title: "✅ PureRSS — Webhook configuré",
      description: `Le webhook pour le flux **${feedName}** est opérationnel. Les nouveaux items seront envoyés ici automatiquement.`,
      color: 0x56d364,
      footer: { text: "PureRSS" },
      timestamp: new Date().toISOString(),
    }],
  });
}
