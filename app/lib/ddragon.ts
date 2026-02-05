const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

export function championIconUrl(version: string, championName: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${championName}.png`;
}

export function itemIconUrl(version: string, itemId: number): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/item/${itemId}.png`;
}

export function summonerSpellIconUrl(version: string, spellName: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/spell/${spellName}.png`;
}

export function profileIconUrl(version: string, iconId: number): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/profileicon/${iconId}.png`;
}

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
