import { cacheGet, cacheSet } from "./db.server";
import type { SpriteCoords, SpriteData } from "./ddragon";

const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";
const VERSION_TTL = 6 * 60 * 60; // 6 hours
const SPRITE_TTL = 24 * 60 * 60; // 24 hours

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

export async function getSpriteData(version: string): Promise<SpriteData> {
  const cacheKey = `sprites:${version}`;
  const cached = cacheGet<SpriteData>(cacheKey, SPRITE_TTL);
  if (cached) return cached;

  const [champRes, itemRes, spellRes] = await Promise.all([
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`),
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/item.json`),
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/summoner.json`),
  ]);

  const champJson = await champRes.json();
  const itemJson = await itemRes.json();
  const spellJson = await spellRes.json();

  const sheetSizes: Record<string, { w: number; h: number }> = {};

  function trackSheet(sprite: string, x: number, y: number, w: number, h: number) {
    if (!sheetSizes[sprite]) sheetSizes[sprite] = { w: 0, h: 0 };
    sheetSizes[sprite].w = Math.max(sheetSizes[sprite].w, x + w);
    sheetSizes[sprite].h = Math.max(sheetSizes[sprite].h, y + h);
  }

  const champions: Record<string, SpriteCoords> = {};
  const championNames: Record<string, string> = {};
  for (const [key, val] of Object.entries(champJson.data)) {
    const entry = val as { name: string; image: { sprite: string; x: number; y: number; w: number; h: number } };
    champions[key] = { sprite: entry.image.sprite, x: entry.image.x, y: entry.image.y, w: entry.image.w, h: entry.image.h };
    championNames[key] = entry.name;
    trackSheet(entry.image.sprite, entry.image.x, entry.image.y, entry.image.w, entry.image.h);
  }

  const items: Record<string, SpriteCoords> = {};
  const itemNames: Record<string, string> = {};
  for (const [key, val] of Object.entries(itemJson.data)) {
    const entry = val as { name: string; image: { sprite: string; x: number; y: number; w: number; h: number } };
    items[key] = { sprite: entry.image.sprite, x: entry.image.x, y: entry.image.y, w: entry.image.w, h: entry.image.h };
    itemNames[key] = entry.name;
    trackSheet(entry.image.sprite, entry.image.x, entry.image.y, entry.image.w, entry.image.h);
  }

  const spells: Record<string, SpriteCoords> = {};
  const spellNames: Record<string, string> = {};
  for (const [key, val] of Object.entries(spellJson.data)) {
    const entry = val as { name: string; image: { sprite: string; x: number; y: number; w: number; h: number } };
    spells[key] = { sprite: entry.image.sprite, x: entry.image.x, y: entry.image.y, w: entry.image.w, h: entry.image.h };
    spellNames[key] = entry.name;
    trackSheet(entry.image.sprite, entry.image.x, entry.image.y, entry.image.w, entry.image.h);
  }

  const data: SpriteData = { champions, items, spells, sheetSizes, championNames, itemNames, spellNames };
  cacheSet(cacheKey, data);
  return data;
}
