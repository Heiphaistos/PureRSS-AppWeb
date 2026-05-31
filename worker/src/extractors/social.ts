import type { ExtractedItem } from "./generic.ts";

export async function extractSocial(sourceUrl: string): Promise<ExtractedItem[]> {
  if (sourceUrl.includes("instagram.com"))  return extractInstagram(sourceUrl);
  if (sourceUrl.includes("tiktok.com"))     return extractTiktok(sourceUrl);
  if (sourceUrl.includes("facebook.com"))   return extractFacebook(sourceUrl);
  throw new Error("Plateforme sociale non reconnue");
}

async function extractInstagram(url: string): Promise<ExtractedItem[]> {
  const usernameMatch = url.match(/instagram\.com\/([^/?#]+)/);
  const username = usernameMatch?.[1] ?? "unknown";

  // Instagram API non officielle (comptes publics uniquement)
  const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "Instagram 76.0.0.15.395 Android",
      "X-IG-App-ID": "936619743392459",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Instagram API: HTTP ${res.status} — compte privé ou rate-limité`);
  }

  const data = await res.json() as Record<string, unknown>;

  type IGEdge = { node: { shortcode: string; taken_at_timestamp: number; edge_media_to_caption?: { edges: { node: { text: string } }[] } } };
  const edges = (data as { data?: { user?: { edge_owner_to_timeline_media?: { edges: IGEdge[] } } } })
    ?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];

  return edges.map(({ node }) => {
    const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
    const date = new Date(node.taken_at_timestamp * 1000).toUTCString();
    return {
      title: caption.slice(0, 100) || "Post Instagram",
      link: `https://www.instagram.com/p/${node.shortcode}/`,
      description: caption || undefined,
      pub_date: date,
      author: username,
    };
  });
}

async function extractTiktok(url: string): Promise<ExtractedItem[]> {
  const usernameMatch = url.match(/tiktok\.com\/@([^/?#]+)/);
  const username = usernameMatch?.[1] ?? "unknown";

  // TikTok bloque agressivement le scraping — on retourne un item d'info
  return [{
    title: `TikTok @${username} — Flux non disponible`,
    link: url,
    description: `TikTok bloque le scraping depuis des serveurs. Utilisez un service comme RSS.app ou nitter pour ce compte. URL: ${url}`,
    pub_date: new Date().toUTCString(),
    author: username,
  }];
}

async function extractFacebook(url: string): Promise<ExtractedItem[]> {
  // Facebook bloque quasi-totalement les requêtes non authentifiées
  const res = await fetch(url, {
    headers: {
      "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Accept": "text/html",
    },
    signal: AbortSignal.timeout(20_000),
  });

  const html = await res.text();

  // Extraire les og: meta tags
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const descMatch  = html.match(/<meta property="og:description" content="([^"]+)"/);

  if (!titleMatch) {
    throw new Error("Facebook: contenu non accessible. Essayez un compte/page public ou utilisez RSS.app.");
  }

  return [{
    title: titleMatch[1],
    link: url,
    description: descMatch?.[1] ?? undefined,
    pub_date: new Date().toUTCString(),
  }];
}
