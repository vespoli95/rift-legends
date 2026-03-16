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
  teamPosition?: string;
  teamKills?: number;
}): number {
  const minutes = match.gameDuration / 60 || 1;
  const isSupport = match.teamPosition === "UTILITY";

  // KDA component (0-10): diminishing returns via log curve
  const kdaVal = match.deaths === 0
    ? (match.kills + match.assists) * 1.5
    : (match.kills + match.assists) / match.deaths;
  const kdaScore = Math.min(10, Math.log(kdaVal + 1) * 3.5);

  // Kill participation component (0-10): % of team kills involved in
  const kp = match.teamKills != null && match.teamKills > 0
    ? (match.kills + match.assists) / match.teamKills
    : null;
  const kpScore = kp != null ? Math.min(10, kp * 12) : null;

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

  // Weights: KP gets 0.10, taken from damage (-0.05) and gold (-0.05)
  // When KP is unavailable, fall back to original weights
  const w = isSupport
    ? kpScore != null
      ? { kda: 0.35, kp: 0.10, cs: 0.03, vision: 0.25, dmg: 0.17, gold: 0.10 }
      : { kda: 0.37, kp: 0, cs: 0.03, vision: 0.28, dmg: 0.20, gold: 0.12 }
    : kpScore != null
      ? { kda: 0.28, kp: 0.10, cs: 0.13, vision: 0.09, dmg: 0.27, gold: 0.13 }
      : { kda: 0.30, kp: 0, cs: 0.15, vision: 0.10, dmg: 0.30, gold: 0.15 };

  const score =
    kdaScore * w.kda +
    (kpScore ?? 0) * w.kp +
    csScore * w.cs +
    visionScoreVal * w.vision +
    dmgScore * w.dmg +
    goldScore * w.gold;

  return Math.round(score * 10) / 10;
}

/** Unrounded rift score — used internally for ranking to avoid false ties from rounding. */
function riftScoreRaw(match: Parameters<typeof riftScore>[0]): number {
  const minutes = match.gameDuration / 60 || 1;
  const isSupport = match.teamPosition === "UTILITY";

  const kdaVal = match.deaths === 0
    ? (match.kills + match.assists) * 1.5
    : (match.kills + match.assists) / match.deaths;
  const kdaScore = Math.min(10, Math.log(kdaVal + 1) * 3.5);

  const kp = match.teamKills != null && match.teamKills > 0
    ? (match.kills + match.assists) / match.teamKills
    : null;
  const kpScore = kp != null ? Math.min(10, kp * 12) : null;

  const csScore = Math.min(10, match.csPerMin * 1.1);
  const visionPerMin = match.visionScore / minutes;
  const visionScoreVal = Math.min(10, visionPerMin * 6);
  const dpm = match.totalDamageDealtToChampions / minutes;
  const dmgScore = Math.min(10, dpm / 60);
  const gpm = match.goldEarned / minutes;
  const goldScore = Math.min(10, gpm / 45);

  const w = isSupport
    ? kpScore != null
      ? { kda: 0.35, kp: 0.10, cs: 0.03, vision: 0.25, dmg: 0.17, gold: 0.10 }
      : { kda: 0.37, kp: 0, cs: 0.03, vision: 0.28, dmg: 0.20, gold: 0.12 }
    : kpScore != null
      ? { kda: 0.28, kp: 0.10, cs: 0.13, vision: 0.09, dmg: 0.27, gold: 0.13 }
      : { kda: 0.30, kp: 0, cs: 0.15, vision: 0.10, dmg: 0.30, gold: 0.15 };

  return (
    kdaScore * w.kda +
    (kpScore ?? 0) * w.kp +
    csScore * w.cs +
    visionScoreVal * w.vision +
    dmgScore * w.dmg +
    goldScore * w.gold
  );
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
  teamKills?: number,
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
    teamPosition: participant.teamPosition,
    teamKills,
  });
}

type RankableParticipant = {
  puuid: string;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  visionScore: number;
  totalDamageDealtToChampions: number;
  goldEarned: number;
  teamPosition?: string;
  win?: boolean;
};

/**
 * Compute game ranks (1–10) for all participants using unrounded rift scores.
 * Tie-break: higher raw score wins; if still tied, higher (kills+assists) wins.
 * Returns a Map of puuid -> rank.
 */
export function computeGameRanks(
  participants: RankableParticipant[],
  gameDuration: number,
): Map<string, number> {
  // Pre-compute team kills for kill participation
  const teamKillsMap = new Map<boolean, number>();
  for (const p of participants) {
    const team = p.win ?? true;
    teamKillsMap.set(team, (teamKillsMap.get(team) ?? 0) + p.kills);
  }

  const entries = participants.map((p) => {
    const totalCs = p.totalMinionsKilled + p.neutralMinionsKilled;
    const teamKills = teamKillsMap.get(p.win ?? true) ?? 0;
    const raw = riftScoreRaw({
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      csPerMin: csPerMin(totalCs, gameDuration),
      visionScore: p.visionScore,
      totalDamageDealtToChampions: p.totalDamageDealtToChampions,
      goldEarned: p.goldEarned,
      gameDuration,
      teamPosition: p.teamPosition,
      teamKills,
    });
    return { puuid: p.puuid, raw, ka: p.kills + p.assists };
  });

  const ranks = new Map<string, number>();
  for (const entry of entries) {
    const higherCount = entries.filter(
      (o) => o.raw > entry.raw || (o.raw === entry.raw && o.ka > entry.ka),
    ).length;
    ranks.set(entry.puuid, higherCount + 1);
  }
  return ranks;
}

const ROLE_ORDER: Record<string, number> = {
  TOP: 0,
  JUNGLE: 1,
  MIDDLE: 2,
  BOTTOM: 3,
  UTILITY: 4,
};

export function sortByRole<T extends { teamPosition?: string }>(
  participants: T[],
): T[] {
  return [...participants].sort(
    (a, b) =>
      (ROLE_ORDER[a.teamPosition ?? ""] ?? 99) -
      (ROLE_ORDER[b.teamPosition ?? ""] ?? 99),
  );
}

export function riftScoreColor(score: number): string {
  if (score >= 8) return "text-orange-500 dark:text-orange-400";
  if (score >= 6) return "text-blue-500 dark:text-blue-400";
  if (score >= 4) return "text-green-500 dark:text-green-400";
  return "text-gray-500 dark:text-gray-400";
}

export function ordinalSuffix(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
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
