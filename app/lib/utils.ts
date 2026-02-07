export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatKDA(kills: number, deaths: number, assists: number): string {
  return `${kills}/${deaths}/${assists}`;
}

export function kdaRatio(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return ((kills + assists) / deaths).toFixed(2);
}

export function csPerMin(cs: number, gameDurationSeconds: number): number {
  const minutes = gameDurationSeconds / 60;
  if (minutes === 0) return 0;
  return Math.round((cs / minutes) * 10) / 10;
}

/**
 * Rift Score: 0–10 performance rating for a single game.
 * Weighted blend of KDA, CS/min, vision, damage/min, gold/min.
 * Supports (role="UTILITY") use adjusted weights that value vision and
 * KDA more heavily while reducing CS, damage, and gold expectations.
 */
export function riftScore(match: {
  kills: number;
  deaths: number;
  assists: number;
  csPerMin: number;
  visionScore: number;
  totalDamageDealtToChampions: number;
  goldEarned: number;
  gameDuration: number;
  role?: string;
}): number {
  const minutes = match.gameDuration / 60 || 1;
  const isSupport = match.role === "UTILITY";

  // KDA component (0-10): diminishing returns via log curve
  const kdaVal = match.deaths === 0
    ? (match.kills + match.assists) * 1.5
    : (match.kills + match.assists) / match.deaths;
  const kdaScore = Math.min(10, Math.log(kdaVal + 1) * 3.5);

  // CS/min component (0-10): 8 cs/min = ~8, 10+ = 10
  const csScore = Math.min(10, match.csPerMin * 1.1);

  // Vision component (0-10): scale by game length, ~1 vision/min is solid
  const visionPerMin = match.visionScore / minutes;
  const visionScoreVal = Math.min(10, visionPerMin * 6);

  // Damage/min component (0-10): ~600 dpm is great
  const dpm = match.totalDamageDealtToChampions / minutes;
  const dmgScore = Math.min(10, dpm / 60);

  // Gold/min component (0-10): ~450 gpm is great
  const gpm = match.goldEarned / minutes;
  const goldScore = Math.min(10, gpm / 45);

  // Supports: boost KDA & vision weight, reduce CS/damage/gold weight
  const w = isSupport
    ? { kda: 0.40, cs: 0.03, vision: 0.30, dmg: 0.15, gold: 0.12 }
    : { kda: 0.35, cs: 0.15, vision: 0.10, dmg: 0.25, gold: 0.15 };

  const score =
    kdaScore * w.kda +
    csScore * w.cs +
    visionScoreVal * w.vision +
    dmgScore * w.dmg +
    goldScore * w.gold;

  return Math.round(score * 10) / 10;
}

export function participantRiftScore(
  participant: {
    kills: number;
    deaths: number;
    assists: number;
    totalMinionsKilled: number;
    neutralMinionsKilled: number;
    visionScore: number;
    totalDamageDealtToChampions: number;
    goldEarned: number;
    teamPosition?: string;
  },
  gameDuration: number,
): number {
  const totalCs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  return riftScore({
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    csPerMin: csPerMin(totalCs, gameDuration),
    visionScore: participant.visionScore,
    totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
    goldEarned: participant.goldEarned,
    gameDuration,
    role: participant.teamPosition,
  });
}

export function riftScoreColor(score: number): string {
  if (score >= 8) return "text-orange-500 dark:text-orange-400";
  if (score >= 6) return "text-blue-500 dark:text-blue-400";
  if (score >= 4) return "text-green-500 dark:text-green-400";
  return "text-gray-500 dark:text-gray-400";
}

export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const trimmed = input.trim();
  const hashIndex = trimmed.lastIndexOf("#");
  if (hashIndex === -1) return null;

  const gameName = trimmed.slice(0, hashIndex).trim();
  const tagLine = trimmed.slice(hashIndex + 1).trim();

  if (!gameName || !tagLine) return null;
  if (gameName.length < 3 || gameName.length > 16) return null;
  if (tagLine.length < 2 || tagLine.length > 5) return null;

  return { gameName, tagLine };
}
