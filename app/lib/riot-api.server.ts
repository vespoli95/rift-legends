import { cacheGet, cacheSet, recordLpSnapshot, getLpSnapshots } from "./db.server";
import type { LpSnapshot } from "./db.server";
import type {
  RiotAccount,
  MatchDetail,
  ProcessedMatch,
  TeamMember,
  MemberWithMatches,
} from "./types";
import { csPerMin, computeGameRanks } from "./utils";

const RIOT_API_KEY = process.env.RIOT_API_KEY;
console.log("RIOT_API_KEY loaded:", RIOT_API_KEY ? "Yes (length: " + RIOT_API_KEY.length + ")" : "No");
const AMERICAS_BASE = "https://americas.api.riotgames.com";
const NA1_BASE = "https://na1.api.riotgames.com";

const ACCOUNT_TTL = 24 * 60 * 60;       // 24h
const SUMMONER_TTL = 24 * 60 * 60;     // 24h
const RANKED_TTL = 30 * 60;             // 30min
const MATCH_LIST_TTL = 5 * 60;          // 5min
const MATCH_DETAIL_TTL = 7 * 24 * 60 * 60; // 7 days

// --- Concurrency Limiter ---

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}

  get stats() {
    return { active: this.active, queued: this.queue.length, max: this.max };
  }

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    const { active, queued } = this.stats;
    console.log(`[riot-api] semaphore full (${active}/${this.max}), queued: ${queued + 1}`);
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const riotSemaphore = new Semaphore(5);

// --- Error Classes ---

export class RiotApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "RiotApiError";
  }
}

// --- Core Fetch ---

const MAX_RETRIES = 3;
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function urlTag(url: string): string {
  // Extract the meaningful part: e.g. "/lol/match/v5/matches/NA1_123"
  try {
    const { pathname } = new URL(url);
    return pathname.length > 60 ? pathname.slice(0, 60) + "..." : pathname;
  } catch {
    return url.slice(0, 60);
  }
}

async function riotFetchInner(url: string, attempt = 1, rateLimitRetries = 0): Promise<Response> {
  if (!RIOT_API_KEY) {
    throw new RiotApiError("RIOT_API_KEY is not configured", 403);
  }

  const tag = urlTag(url);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-Riot-Token": RIOT_API_KEY },
    });
  } catch (error) {
    // Network error - retry
    console.warn(`[riot-api] network error on ${tag} (attempt ${attempt}/${MAX_RETRIES})`);
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * attempt);
      return riotFetchInner(url, attempt + 1, rateLimitRetries);
    }
    throw new RiotApiError("Network error: failed to reach Riot API", 0);
  }

  // Rate limited - wait and retry (with a cap!)
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
    const limitType = res.headers.get("X-Rate-Limit-Type") || "unknown";
    const appCount = res.headers.get("X-App-Rate-Limit-Count");
    const appLimit = res.headers.get("X-App-Rate-Limit");
    const methodCount = res.headers.get("X-Method-Rate-Limit-Count");
    const methodLimit = res.headers.get("X-Method-Rate-Limit");
    console.warn(
      `[riot-api] 429 RATE LIMITED on ${tag}\n` +
      `  type: ${limitType}, Retry-After: ${retryAfter}s\n` +
      `  app: ${appCount} / ${appLimit}\n` +
      `  method: ${methodCount} / ${methodLimit}\n` +
      `  retry ${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES}`
    );
    if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
      console.error(`[riot-api] 429 MAX RETRIES EXCEEDED on ${tag} — giving up`);
      throw new RiotApiError("Rate limited by Riot API (max retries exceeded)", 429);
    }
    console.log(`[riot-api] sleeping ${retryAfter}s before retry...`);
    await sleep(retryAfter * 1000);
    return riotFetchInner(url, attempt, rateLimitRetries + 1);
  }

  // Server error (5xx) - retry
  if (res.status >= 500) {
    console.warn(`[riot-api] ${res.status} on ${tag} (attempt ${attempt}/${MAX_RETRIES})`);
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * attempt);
      return riotFetchInner(url, attempt + 1, rateLimitRetries);
    }
  }

  if (res.status === 401) {
    throw new RiotApiError("Riot API key is missing or invalid", 401);
  }

  if (res.status === 403) {
    throw new RiotApiError("Riot API key is invalid or expired", 403);
  }

  if (res.status === 404) {
    throw new RiotApiError("Not found", 404);
  }

  if (!res.ok) {
    throw new RiotApiError(`Riot API error: ${res.status} ${res.statusText}`, res.status);
  }

  return res;
}

function logRateLimitHeaders(res: Response, tag: string) {
  const appLimit = res.headers.get("X-App-Rate-Limit");
  const appCount = res.headers.get("X-App-Rate-Limit-Count");
  const methodLimit = res.headers.get("X-Method-Rate-Limit");
  const methodCount = res.headers.get("X-Method-Rate-Limit-Count");

  if (!appLimit || !appCount) return;

  // Parse "20:1,100:120" format — check each bucket
  const limits = appLimit.split(",");
  const counts = appCount.split(",");
  for (let i = 0; i < limits.length; i++) {
    const [limitVal] = (limits[i] || "").split(":");
    const [countVal] = (counts[i] || "").split(":");
    const limit = parseInt(limitVal, 10);
    const count = parseInt(countVal, 10);
    if (!limit || !count) continue;
    const pct = count / limit;
    if (pct >= 0.9) {
      console.warn(
        `[riot-api] APP RATE LIMIT WARNING: ${count}/${limit} (${Math.round(pct * 100)}%) on ${tag}`
      );
    }
  }

  // Same check for method rate limits
  if (methodLimit && methodCount) {
    const mLimits = methodLimit.split(",");
    const mCounts = methodCount.split(",");
    for (let i = 0; i < mLimits.length; i++) {
      const [limitVal] = (mLimits[i] || "").split(":");
      const [countVal] = (mCounts[i] || "").split(":");
      const limit = parseInt(limitVal, 10);
      const count = parseInt(countVal, 10);
      if (!limit || !count) continue;
      const pct = count / limit;
      if (pct >= 0.9) {
        console.warn(
          `[riot-api] METHOD RATE LIMIT WARNING: ${count}/${limit} (${Math.round(pct * 100)}%) on ${tag}`
        );
      }
    }
  }

  console.log(
    `[riot-api] rate limits — app: ${appCount} / ${appLimit}` +
    (methodLimit ? `, method: ${methodCount} / ${methodLimit}` : "") +
    ` | ${tag}`
  );
}

async function riotFetch(url: string): Promise<Response> {
  const tag = urlTag(url);
  const { active, queued } = riotSemaphore.stats;
  if (queued > 0) {
    console.log(`[riot-api] waiting for semaphore slot: ${tag} (active: ${active}, queued: ${queued})`);
  }
  await riotSemaphore.acquire();
  const start = Date.now();
  try {
    const res = await riotFetchInner(url);
    console.log(`[riot-api] ${res.status} ${tag} (${Date.now() - start}ms)`);
    logRateLimitHeaders(res, tag);
    return res;
  } catch (err) {
    console.error(`[riot-api] FAILED ${tag} (${Date.now() - start}ms):`, err instanceof Error ? err.message : err);
    throw err;
  } finally {
    riotSemaphore.release();
  }
}

// --- Account Lookup ---

export async function getAccountByRiotId(
  gameName: string,
  tagLine: string
): Promise<RiotAccount> {
  const cacheKey = `account:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`;
  const cached = cacheGet<RiotAccount>(cacheKey, ACCOUNT_TTL);
  if (cached) {
    console.log(`[riot-api] CACHE HIT ${cacheKey}`);
    return cached;
  }

  const url = `${AMERICAS_BASE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await riotFetch(url);
  const data: RiotAccount = await res.json();

  cacheSet(cacheKey, data);
  return data;
}

// --- Summoner Lookup ---

interface SummonerData {
  profileIconId: number;
  summonerLevel: number;
}

export async function getSummonerByPuuid(puuid: string): Promise<SummonerData> {
  const cacheKey = `summoner:${puuid}`;
  const cached = cacheGet<SummonerData>(cacheKey, SUMMONER_TTL);
  if (cached) {
    console.log(`[riot-api] CACHE HIT ${cacheKey}`);
    return cached;
  }

  const url = `${NA1_BASE}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const res = await riotFetch(url);
  const data = await res.json();

  const summoner: SummonerData = {
    profileIconId: data.profileIconId,
    summonerLevel: data.summonerLevel,
  };

  cacheSet(cacheKey, summoner);
  return summoner;
}

// --- Ranked Data ---

export interface RankedData {
  tier: string;
  rank: string;
  lp: number;
  wins: number;
  losses: number;
}

interface CachedRanked {
  hasRank: boolean;
  data: RankedData | null;
}

export async function getRankedByPuuid(puuid: string, forceFresh = false): Promise<RankedData | null> {
  const cacheKey = `ranked:${puuid}`;
  const cached = !forceFresh ? cacheGet<CachedRanked>(cacheKey, RANKED_TTL) : null;
  if (cached) {
    console.log(`[riot-api] CACHE HIT ${cacheKey}`);
    return cached.data;
  }

  try {
    const url = `${NA1_BASE}/lol/league/v4/entries/by-puuid/${puuid}`;
    const res = await riotFetch(url);
    const entries = await res.json();

    const soloQueue = entries.find(
      (e: { queueType: string }) => e.queueType === "RANKED_SOLO_5x5"
    );

    if (!soloQueue) {
      cacheSet(cacheKey, { hasRank: false, data: null });
      return null;
    }

    const ranked: RankedData = {
      tier: soloQueue.tier,
      rank: soloQueue.rank,
      lp: soloQueue.leaguePoints,
      wins: soloQueue.wins,
      losses: soloQueue.losses,
    };

    cacheSet(cacheKey, { hasRank: true, data: ranked });

    // Record LP snapshot for LP gain/loss tracking
    recordLpSnapshot(puuid, ranked.tier, ranked.rank, ranked.lp, ranked.wins, ranked.losses);

    return ranked;
  } catch (error) {
    console.error("Failed to fetch ranked data:", error);
    return null;
  }
}

// --- Match IDs ---

async function getMatchIds(puuid: string, count = 3, start = 0): Promise<string[]> {
  const cacheKey = `matches:${puuid}:${start}:${count}`;
  const cached = cacheGet<string[]>(cacheKey, MATCH_LIST_TTL);
  if (cached) {
    console.log(`[riot-api] CACHE HIT ${cacheKey}`);
    return cached;
  }

  const url = `${AMERICAS_BASE}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`;
  const res = await riotFetch(url);
  const data: string[] = await res.json();

  cacheSet(cacheKey, data);
  return data;
}

export async function getMatchIdsForMember(
  member: TeamMember,
  count = 3,
  start = 0
): Promise<string[]> {
  const puuid =
    member.puuid ||
    (await getAccountByRiotId(member.game_name, member.tag_line)).puuid;
  return getMatchIds(puuid, count, start);
}

export async function getMatchIdsForPuuid(
  puuid: string,
  count = 10,
  start = 0
): Promise<string[]> {
  return getMatchIds(puuid, count, start);
}

// --- Season Match IDs (all matches since season start) ---

// Current ranked season; update when a new season begins.
const SEASON_START_EPOCH = Math.floor(new Date("2026-01-09T00:00:00Z").getTime() / 1000);
const SEASON_START_MS = SEASON_START_EPOCH * 1000;
const SEASON_IDS_TTL = 10 * 60; // 10min cache for the full ID list

async function getAllSeasonMatchIds(puuid: string): Promise<string[]> {
  const cacheKey = `season-ids:${puuid}`;
  const cached = cacheGet<string[]>(cacheKey, SEASON_IDS_TTL);
  if (cached) {
    console.log(`[riot-api] CACHE HIT ${cacheKey} (${cached.length} ids)`);
    return cached;
  }

  const allIds: string[] = [];
  let offset = 0;
  const pageSize = 100;
  while (true) {
    const url = `${AMERICAS_BASE}/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${SEASON_START_EPOCH}&start=${offset}&count=${pageSize}`;
    const res = await riotFetch(url);
    const ids: string[] = await res.json();
    allIds.push(...ids);
    if (ids.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`[riot-api] fetched ${allIds.length} season match IDs for ${puuid}`);
  cacheSet(cacheKey, allIds);
  return allIds;
}

/**
 * Fetch all season matches for a player and return processed results.
 * Match details are individually cached (7d TTL), so repeat visits are fast.
 */
export async function getSeasonMatches(puuid: string): Promise<ProcessedMatch[]> {
  const matchIds = await getAllSeasonMatchIds(puuid);
  console.log(`[riot-api] season: processing ${matchIds.length} match IDs (startTime=${SEASON_START_EPOCH}, ${new Date(SEASON_START_MS).toISOString()})`);

  let failedCount = 0;
  const results = await Promise.all(
    matchIds.map(async (id) => {
      try {
        return await getProcessedMatch(id, puuid);
      } catch {
        failedCount++;
        return null;
      }
    }),
  );

  // Double-filter by gameCreation in case Riot API startTime isn't precise
  const matches = results
    .filter((m): m is ProcessedMatch => m !== null)
    .filter((m) => m.gameCreation >= SEASON_START_MS);

  if (failedCount > 0) {
    console.warn(`[riot-api] season matches: ${matches.length} loaded, ${failedCount} failed`);
  }
  console.log(`[riot-api] season matches: returning ${matches.length} (after gameCreation filter)`);
  return matches;
}

export async function getProcessedMatch(
  matchId: string,
  puuid: string
): Promise<ProcessedMatch | null> {
  const match = await getMatchDetail(matchId);
  return processMatch(match, puuid);
}

// --- Match Detail (with in-flight dedup) ---

const inflightMatches = new Map<string, Promise<MatchDetail>>();

export function getMatchDetail(matchId: string): Promise<MatchDetail> {
  const cacheKey = `match:${matchId}`;
  const cached = cacheGet<MatchDetail>(cacheKey, MATCH_DETAIL_TTL);
  if (cached) {
    console.log(`[riot-api] CACHE HIT ${cacheKey}`);
    return Promise.resolve(cached);
  }

  // If a fetch for this match is already in progress, reuse it
  const inflight = inflightMatches.get(matchId);
  if (inflight) {
    console.log(`[riot-api] dedup hit for ${matchId}`);
    return inflight;
  }

  const promise = (async () => {
    const url = `${AMERICAS_BASE}/lol/match/v5/matches/${matchId}`;
    const res = await riotFetch(url);
    const data: MatchDetail = await res.json();
    cacheSet(cacheKey, data);
    return data;
  })().finally(() => {
    inflightMatches.delete(matchId);
  });

  inflightMatches.set(matchId, promise);
  return promise;
}

// --- Process Match ---

function processMatch(match: MatchDetail, puuid: string): ProcessedMatch | null {
  const participant = match.info.participants.find((p) => p.puuid === puuid);
  if (!participant) return null;

  const totalCs = participant.totalMinionsKilled + participant.neutralMinionsKilled;

  // Compute rank using shared ranking logic (unrounded scores + tie-break)
  const ranks = computeGameRanks(match.info.participants, match.info.gameDuration);
  const gameRank = ranks.get(puuid) ?? 10;

  return {
    matchId: match.metadata.matchId,
    win: participant.win,
    championName: participant.championName,
    champLevel: participant.champLevel,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    cs: totalCs,
    csPerMin: csPerMin(totalCs, match.info.gameDuration),
    visionScore: participant.visionScore,
    items: [
      participant.item0,
      participant.item1,
      participant.item2,
      participant.item3,
      participant.item4,
      participant.item5,
    ],
    trinket: participant.item6,
    summoner1Id: participant.summoner1Id,
    summoner2Id: participant.summoner2Id,
    gameDuration: match.info.gameDuration,
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
    totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
    totalDamageTaken: participant.totalDamageTaken,
    goldEarned: participant.goldEarned,
    gameRank,
    teamPosition: participant.teamPosition,
  };
}

// --- LP Change Calculation ---

const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];
const RANK_ORDER = ["IV", "III", "II", "I"];

/** Convert tier/rank/lp to a flat LP number for easy delta calculation. */
function flatLp(tier: string, rank: string, lp: number): number {
  const tierIndex = TIER_ORDER.indexOf(tier);
  if (tierIndex >= 0) {
    const rankIndex = RANK_ORDER.indexOf(rank);
    return tierIndex * 400 + (rankIndex >= 0 ? rankIndex : 0) * 100 + lp;
  }
  // Master, Grandmaster, Challenger share a flat LP ladder above Diamond
  return 2800 + lp;
}

const RANKED_SOLO_QUEUE_ID = 420;

/**
 * Attach LP gain/loss to ranked matches by comparing LP snapshots.
 * Groups ranked matches by the snapshot pair that brackets them, then:
 * - If exactly 1 game between snapshots: assign exact LP delta.
 * - If multiple games: estimate per-game LP by dividing total delta
 *   proportionally among wins (positive share) and losses (negative share).
 */
export function attachLpChanges(
  puuid: string,
  matches: ProcessedMatch[],
): void {
  const snapshots = getLpSnapshots(puuid);
  if (snapshots.length < 2) return;

  // Group matches by their bracketing snapshot pair
  const rankedMatches = matches.filter((m) => m.queueId === RANKED_SOLO_QUEUE_ID);
  if (rankedMatches.length === 0) return;

  // For each consecutive snapshot pair, find which ranked matches fall between them
  for (let i = 0; i < snapshots.length - 1; i++) {
    const before = snapshots[i];
    const after = snapshots[i + 1];

    const gamesPlayed = (after.wins + after.losses) - (before.wins + before.losses);
    if (gamesPlayed < 1) continue;

    const totalDelta = flatLp(after.tier, after.rank, after.lp) - flatLp(before.tier, before.rank, before.lp);

    // Find ranked matches whose end time falls between these two snapshots
    const bracketed = rankedMatches.filter((m) => {
      const gameEndTime = Math.floor((m.gameCreation + m.gameDuration * 1000) / 1000);
      return gameEndTime > before.recorded_at && gameEndTime <= after.recorded_at;
    });

    if (bracketed.length === 0) continue;

    if (bracketed.length === 1) {
      // Exact: only one match between snapshots
      bracketed[0].lpChange = totalDelta;
    } else {
      // Estimate: distribute LP delta across matches
      const wins = bracketed.filter((m) => m.win).length;
      const losses = bracketed.filter((m) => !m.win).length;

      if (wins === 0 || losses === 0) {
        // All wins or all losses — divide evenly
        const perGame = Math.round(totalDelta / bracketed.length);
        for (const m of bracketed) {
          m.lpChange = perGame;
        }
      } else {
        // Mixed results — estimate gain/loss per game
        // Assume gain/loss ratio ~5:4 (typical ~25 gain, ~20 loss)
        // totalDelta = wins * gain - losses * loss, gain = 1.25 * loss
        // totalDelta = wins * 1.25 * loss - losses * loss
        // loss = totalDelta / (wins * 1.25 - losses)
        const denom = wins * 1.25 - losses;
        if (Math.abs(denom) > 0.01) {
          const lossPerGame = totalDelta / denom;
          const gainPerGame = 1.25 * lossPerGame;
          for (const m of bracketed) {
            m.lpChange = Math.round(m.win ? gainPerGame : -Math.abs(lossPerGame));
          }
        } else {
          // Fallback: divide evenly
          const perGame = Math.round(totalDelta / bracketed.length);
          for (const m of bracketed) {
            m.lpChange = perGame;
          }
        }
      }
    }
  }
}

// --- High-level: Get Member Match History ---

export async function getMemberMatchHistory(
  member: TeamMember
): Promise<MemberWithMatches> {
  const memberTag = `${member.game_name}#${member.tag_line}`;
  const t0 = Date.now();
  console.log(`[riot-api] loading history for ${memberTag}`);

  try {
    const puuid =
      member.puuid ||
      (await getAccountByRiotId(member.game_name, member.tag_line)).puuid;

    // Fetch matches and ranked data in parallel
    const [matchIds, ranked] = await Promise.all([
      getMatchIds(puuid, 10),
      getRankedByPuuid(puuid),
    ]);

    console.log(`[riot-api] ${memberTag}: fetching ${matchIds.length} match details`);

    let failedCount = 0;
    const matchDetails = await Promise.all(
      matchIds.map(async (id) => {
        try {
          return await getMatchDetail(id);
        } catch (err) {
          failedCount++;
          console.warn(`[riot-api] ${memberTag}: match ${id} failed:`, err instanceof Error ? err.message : err);
          return null;
        }
      })
    );

    const matches = matchDetails
      .filter((m): m is MatchDetail => m !== null)
      .map((m) => processMatch(m, puuid))
      .filter((m): m is ProcessedMatch => m !== null);

    // Attach LP gain/loss data to ranked matches
    attachLpChanges(puuid, matches);

    let error: string | undefined;
    if (failedCount > 0 && matches.length > 0) {
      error = `Loaded ${matches.length} of ${matchIds.length} matches (${failedCount} failed)`;
    } else if (failedCount > 0 && matches.length === 0) {
      error = "All matches failed to load — try again shortly";
    }

    console.log(
      `[riot-api] ${memberTag}: done in ${Date.now() - t0}ms — ` +
      `${matches.length} matches loaded, ${failedCount} failed`
    );
    return { member, matches, ranked, error };
  } catch (error) {
    const message =
      error instanceof RiotApiError
        ? error.message
        : "Failed to load match history";
    console.error(`[riot-api] ${memberTag}: fatal error in ${Date.now() - t0}ms — ${message}`);
    return { member, matches: [], error: message };
  }
}
