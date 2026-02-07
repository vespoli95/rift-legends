import { searchMembers, searchCachedAccounts, searchMatchParticipants, getCachedSummoner } from "~/lib/db.server";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
} from "~/lib/riot-api.server";
import type { Route } from "./+types/api.search-players";

interface SearchResult {
  gameName: string;
  tagLine: string;
  profileIconId: number | null;
  source: "local" | "riot" | "cached";
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (q.length < 1) {
    return Response.json([]);
  }

  const allResults: SearchResult[] = [];
  const seen = new Set<string>();

  function addResult(result: SearchResult) {
    const key = `${result.gameName.toLowerCase()}#${result.tagLine.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      allResults.push(result);
    }
  }

  // Step 1: search local DB (team members)
  const localResults = searchMembers(q);
  for (const r of localResults) {
    addResult({
      gameName: r.game_name,
      tagLine: r.tag_line,
      profileIconId: r.profile_icon_id,
      source: "local",
    });
  }

  // Step 2: search cached account lookups
  const cachedResults = searchCachedAccounts(q);
  for (const r of cachedResults) {
    const summoner = getCachedSummoner(r.puuid);
    addResult({
      gameName: r.gameName,
      tagLine: r.tagLine,
      profileIconId: summoner?.profileIconId ?? null,
      source: "cached",
    });
  }

  // Step 3: search match participants (players seen in cached match data)
  const matchResults = searchMatchParticipants(q);
  for (const r of matchResults) {
    addResult({
      gameName: r.gameName,
      tagLine: r.tagLine,
      profileIconId: null,
      source: "cached",
    });
  }

  // Step 4: try Riot API lookup (requires exact gameName#tagLine)
  if (q.includes("#")) {
    const [gameName, tagLine] = q.split("#", 2);
    if (gameName && gameName.length >= 2 && tagLine && tagLine.length >= 1) {
      const key = `${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;
      if (!seen.has(key)) {
        try {
          const account = await getAccountByRiotId(gameName, tagLine);
          let profileIconId: number | null = null;
          try {
            const summoner = await getSummonerByPuuid(account.puuid);
            profileIconId = summoner.profileIconId;
          } catch {
            // Non-critical
          }
          addResult({
            gameName: account.gameName,
            tagLine: account.tagLine,
            profileIconId,
            source: "riot",
          });
        } catch {
          // Not found
        }
      }
    }
  }

  return Response.json(allResults);
}
