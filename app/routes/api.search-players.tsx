import { searchMembers, searchCachedAccounts, getCachedSummoner } from "~/lib/db.server";
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

  // Step 3: try Riot API lookup
  // Riot API requires exact gameName#tagLine match
  let gameName: string;
  let tagsToTry: string[];

  if (q.includes("#")) {
    const [name, tag] = q.split("#", 2);
    gameName = name;
    tagsToTry = tag && tag.length >= 1 ? [tag] : [];
  } else {
    gameName = q;
    // Try common tags when no tag specified
    tagsToTry = ["NA1", "NA", "EUW", "EUNE", "KR", "BR", "LAN", "LAS", "OCE", "TR", "RU", "JP"];
  }

  if (gameName && gameName.length >= 2 && tagsToTry.length > 0) {
    const lookups = tagsToTry.map(async (tag) => {
      const key = `${gameName.toLowerCase()}#${tag.toLowerCase()}`;
      if (seen.has(key)) return null;

      try {
        const account = await getAccountByRiotId(gameName, tag);
        let profileIconId: number | null = null;
        try {
          const summoner = await getSummonerByPuuid(account.puuid);
          profileIconId = summoner.profileIconId;
        } catch {
          // Non-critical
        }
        return {
          gameName: account.gameName,
          tagLine: account.tagLine,
          profileIconId,
          source: "riot" as const,
        };
      } catch {
        return null;
      }
    });

    const riotResults = (await Promise.all(lookups)).filter(
      (r): r is SearchResult => r !== null
    );

    for (const r of riotResults) {
      addResult(r);
    }
  }

  return Response.json(allResults);
}
