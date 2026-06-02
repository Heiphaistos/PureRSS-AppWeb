const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^fc00:/i,
  /^fe80:/i,
];

export function assertPublicUrl(rawUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    throw new Error("URL invalide");
  }
  if (hostname === "localhost" || PRIVATE_RANGES.some(re => re.test(hostname))) {
    throw new Error(`URL bloquée (réseau privé): ${hostname}`);
  }
}
