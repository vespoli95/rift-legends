const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

// --- Sprite types ---

export interface SpriteCoords {
  sprite: string; // e.g. "champion0.png"
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteData {
  champions: Record<string, SpriteCoords>;
  items: Record<string, SpriteCoords>;
  spells: Record<string, SpriteCoords>;
  sheetSizes: Record<string, { w: number; h: number }>;
  championNames: Record<string, string>;  // key (e.g. "Aatrox") -> display name (e.g. "Aatrox")
  championById: Record<number, string>;   // numeric id (e.g. 266) -> key (e.g. "Aatrox")
  itemNames: Record<string, string>;      // id (e.g. "3157") -> name (e.g. "Zhonya's Hourglass")
  spellNames: Record<string, string>;     // key (e.g. "SummonerFlash") -> name (e.g. "Flash")
}

export function spriteStyle(
  version: string,
  coords: SpriteCoords,
  sheetSizes: Record<string, { w: number; h: number }>,
  displaySize: number,
): React.CSSProperties {
  const sheet = sheetSizes[coords.sprite];
  if (!sheet) return { width: displaySize, height: displaySize };
  const scale = displaySize / coords.w;
  return {
    width: displaySize,
    height: displaySize,
    backgroundImage: `url(${DDRAGON_BASE}/cdn/${version}/img/sprite/${coords.sprite})`,
    backgroundPosition: `${-coords.x * scale}px ${-coords.y * scale}px`,
    backgroundSize: `${sheet.w * scale}px auto`,
    backgroundRepeat: "no-repeat",
    overflow: "hidden",
  };
}

// --- Individual URL helpers (kept for profile icons which have no sprite sheet) ---

export function profileIconUrl(version: string, iconId: number): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/profileicon/${iconId}.png`;
}

// --- Fallback URL helpers (for when sprite data is unavailable) ---

export function championIconUrl(version: string, championName: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${championName}.png`;
}

export function itemIconUrl(version: string, itemId: number): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/item/${itemId}.png`;
}

export function summonerSpellIconUrl(version: string, spellName: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/spell/${spellName}.png`;
}

// --- Maps ---

export const SUMMONER_SPELL_MAP: Record<number, string> = {
  1: "SummonerBoost",       // Cleanse
  3: "SummonerExhaust",     // Exhaust
  4: "SummonerFlash",       // Flash
  6: "SummonerHaste",       // Ghost
  7: "SummonerHeal",        // Heal
  11: "SummonerSmite",      // Smite
  12: "SummonerTeleport",   // Teleport
  13: "SummonerMana",       // Clarity
  14: "SummonerDot",        // Ignite
  21: "SummonerBarrier",    // Barrier
  30: "SummonerPoroRecall", // To the King! (Poro King)
  31: "SummonerPoroThrow",  // Poro Toss (Poro King)
  32: "SummonerSnowball",   // Mark (ARAM)
  39: "SummonerSnowURFSnowball_Mark", // Mark (URF)
  54: "Summoner_UltBookPlaceholder",  // Placeholder
  55: "Summoner_UltBookSmitePlaceholder", // Placeholder Smite
  2202: "SummonerFlash",    // Unleashed Flash
};

export const QUEUE_TYPE_MAP: Record<number, string> = {
  0: "Custom",
  400: "Normal Draft",
  420: "Ranked Solo",
  430: "Normal Blind",
  440: "Ranked Flex",
  450: "ARAM",
  700: "Clash",
  720: "ARAM Clash",
  900: "URF",
  1020: "One for All",
  1090: "TFT Normal",
  1100: "TFT Ranked",
  1300: "Nexus Blitz",
  1400: "Ultimate Spellbook",
  1700: "Arena",
  1900: "URF",
};
