import { cacheGet, cacheSet } from "./db.server";
import type {
  RiotAccount,
  MatchDetail,
  ProcessedMatch,
  TeamMember,
  MemberWithMatches,
} from "./types";
import { csPerMin } from "./utils";

const RIOT_API_KEY = process.env.RIOT_API_KEY;
console.log("RIOT_API_KEY loaded:", RIOT_API_KEY ? "Yes (length: " + RIOT_API_KEY.length + ")" : "No");
const AMERICAS_BASE = "https://americas.api.riotgames.com";
const NA1_BASE = "https://na1.api.riotgames.com";

const ACCOUNT_TTL = 24 * 60 * 60;       // 24h
const SUMMONER_TTL = 24 * 60 * 60;     // 24h
const RANKED_TTL = 30 * 60;             // 30min
const MATCH_LIST_TTL = 5 * 60;          // 5min
const MATCH_DETAIL_TTL = 7 * 24 * 60 * 60; // 7 days

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
const RETRY_DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function riotFetch(url: string, attempt = 1): Promise<Response> {
  if (!RIOT_API_KEY) {
    throw new RiotApiError("RIOT_API_KEY is not configured", 403);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-Riot-Token": RIOT_API_KEY },
    });
  } catch (error) {
    // Network error - retry
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * attempt);
      return riotFetch(url, attempt + 1);
    }
    throw new RiotApiError("Network error: failed to reach Riot API", 0);
  }

  // Rate limited - wait and retry
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
    await sleep(retryAfter * 1000);
    return riotFetch(url, attempt);
  }

  // Server error (5xx) - retry
  if (res.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(RETRY_DELAY_MS * attempt);
    return riotFetch(url, attempt + 1);
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

// --- Account Lookup ---

export async function getAccountByRiotId(
  gameName: string,
  tagLine: string
): Promise<RiotAccount> {
  const cacheKey = `account:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`;
  const cached = cacheGet<RiotAccount>(cacheKey, ACCOUNT_TTL);
  if (cached) return cached;

  const url = `${AMERICAS_BASE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await riotFetch(url);
  const data: RiotAccount = await res.json();

  cacheSet(cacheKey, data);
  return data;
}

// --- Summoner Lookup ---

interface SummonerData {
  id: string; // encrypted summoner ID
  profileIconId: number;
  summonerLevel: number;
}

export async function getSummonerByPuuid(puuid: string): Promise<SummonerData> {
  const cacheKey = `summoner:${puuid}`;
  const cached = cacheGet<SummonerData>(cacheKey, SUMMONER_TTL);
  if (cached) return cached;

  const url = `${NA1_BASE}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const res = await riotFetch(url);
  const data = await res.json();

  const summoner: SummonerData = {
    id: data.id,
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

export async function getRankedData(summonerId: string): Promise<RankedData | null> {
  const cacheKey = `ranked:${summonerId}`;
  const cached = cacheGet<CachedRanked>(cacheKey, RANKED_TTL);
  if (cached) {
    return cached.data;
  }

  const url = `${NA1_BASE}/lol/league/v4/entries/by-summoner/${summonerId}`;
  console.log("Fetching ranked data for summoner:", summonerId);
  const res = await riotFetch(url);
  const entries = await res.json();
  console.log("Ranked entries:", entries);

  // Find solo/duo queue entry
  const soloQueue = entries.find(
    (e: { queueType: string }) => e.queueType === "RANKED_SOLO_5x5"
  );

  if (!soloQueue) {
    console.log("No solo queue entry found");
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

  console.log("Found ranked data:", ranked);
  cacheSet(cacheKey, { hasRank: true, data: ranked });
  return ranked;
}

export async function getRankedByPuuid(puuid: string): Promise<RankedData | null> {
  try {
    // Always fetch fresh summoner data to ensure we have the ID
    const url = `${NA1_BASE}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const cacheKey = `summoner:${puuid}`;

    let summonerId: string;
    const cached = cacheGet<SummonerData>(cacheKey, SUMMONER_TTL);

    if (cached?.id) {
      summonerId = cached.id;
    } else {
      // Fetch fresh data
      const res = await riotFetch(url);
      const data = await res.json();
      const newSummoner: SummonerData = {
        id: data.id,
        profileIconId: data.profileIconId,
        summonerLevel: data.summonerLevel,
      };
      cacheSet(cacheKey, newSummoner);
      summonerId = data.id;
    }

    return await getRankedData(summonerId);
  } catch (error) {
    console.error("Failed to fetch ranked data:", error);
    return null;
  }
}

// --- Match IDs ---

async function getMatchIds(puuid: string, count = 10, start = 0): Promise<string[]> {
  const cacheKey = `matches:${puuid}:${start}:${count}`;
  const cached = cacheGet<string[]>(cacheKey, MATCH_LIST_TTL);
  if (cached) return cached;

  const url = `${AMERICAS_BASE}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`;
  const res = await riotFetch(url);
  const data: string[] = await res.json();

  cacheSet(cacheKey, data);
  return data;
}

export async function getMatchIdsForMember(
  member: TeamMember,
  count = 10,
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

export async function getProcessedMatch(
  matchId: string,
  puuid: string
): Promise<ProcessedMatch | null> {
  try {
    const match = await getMatchDetail(matchId);
    return processMatch(match, puuid);
  } catch {
    return null;
  }
}

// --- Match Detail ---

async function getMatchDetail(matchId: string): Promise<MatchDetail> {
  const cacheKey = `match:${matchId}`;
  const cached = cacheGet<MatchDetail>(cacheKey, MATCH_DETAIL_TTL);
  if (cached) return cached;

  const url = `${AMERICAS_BASE}/lol/match/v5/matches/${matchId}`;
  const res = await riotFetch(url);
  const data: MatchDetail = await res.json();

  cacheSet(cacheKey, data);
  return data;
}

// --- Process Match ---

function processMatch(match: MatchDetail, puuid: string): ProcessedMatch | null {
  const participant = match.info.participants.find((p) => p.puuid === puuid);
  if (!participant) return null;

  const totalCs = participant.totalMinionsKilled + participant.neutralMinionsKilled;

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
    goldEarned: participant.goldEarned,
  };
}

// --- High-level: Get Member Match History ---

export async function getMemberMatchHistory(
  member: TeamMember
): Promise<MemberWithMatches> {
  try {
    const puuid =
      member.puuid ||
      (await getAccountByRiotId(member.game_name, member.tag_line)).puuid;

    // Fetch matches and ranked data in parallel
    const [matchIds, ranked] = await Promise.all([
      getMatchIds(puuid, 10),
      getRankedByPuuid(puuid),
    ]);

    const matchDetails = await Promise.all(
      matchIds.map(async (id) => {
        try {
          return await getMatchDetail(id);
        } catch {
          return null;
        }
      })
    );

    const matches = matchDetails
      .filter((m): m is MatchDetail => m !== null)
      .map((m) => processMatch(m, puuid))
      .filter((m): m is ProcessedMatch => m !== null);

    return { member, matches, ranked };
  } catch (error) {
    const message =
      error instanceof RiotApiError
        ? error.message
        : "Failed to load match history";
    return { member, matches: [], error: message };
  }
}
