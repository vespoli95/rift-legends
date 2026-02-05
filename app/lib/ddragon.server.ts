import { cacheGet, cacheSet } from "./db.server";

const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";
const VERSION_TTL = 6 * 60 * 60; // 6 hours

export async function getCurrentVersion(): Promise<string> {
  const cached = cacheGet<string>("ddragon:version", VERSION_TTL);
  if (cached) return cached;

  const res = await fetch(`${DDRAGON_BASE}/api/versions.json`);
  if (!res.ok) throw new Error("Failed to fetch Data Dragon versions");
  const versions: string[] = await res.json();
  const version = versions[0];

  cacheSet("ddragon:version", version);
  return version;
}
