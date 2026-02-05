import { Link, useFetcher } from "react-router";
import { useEffect, useState, useMemo } from "react";
import type { Route } from "./+types/players.$gameName.$tagLine";
import { getCurrentVersion } from "~/lib/ddragon.server";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  getMatchIdsForPuuid,
  getProcessedMatch,
  getRankedByPuuid,
  RiotApiError,
} from "~/lib/riot-api.server";
import { profileIconUrl } from "~/lib/ddragon";
import { MatchCard } from "~/components/match-card";
import type { ProcessedMatch, RankedInfo } from "~/lib/types";

const TIER_COLORS: Record<string, string> = {
  IRON: "text-gray-500",
  BRONZE: "text-amber-700",
  SILVER: "text-gray-400",
  GOLD: "text-yellow-500",
  PLATINUM: "text-cyan-500",
  EMERALD: "text-emerald-500",
  DIAMOND: "text-blue-400",
  MASTER: "text-purple-500",
  GRANDMASTER: "text-red-500",
  CHALLENGER: "text-yellow-400",
};

function formatRank(ranked: RankedInfo): string {
  const tier = ranked.tier.charAt(0) + ranked.tier.slice(1).toLowerCase();
  return `${tier} ${ranked.rank}`;
}

function RankBadge({ ranked }: { ranked: RankedInfo }) {
  const colorClass = TIER_COLORS[ranked.tier] || "text-gray-500";
  const winRate = Math.round((ranked.wins / (ranked.wins + ranked.losses)) * 100);
  return (
    <div className={`flex items-center gap-2 ${colorClass}`}>
      <span className="text-lg font-semibold">{formatRank(ranked)}</span>
      <span className="text-sm opacity-80">{ranked.lp} LP</span>
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {ranked.wins}W {ranked.losses}L ({winRate}%)
      </span>
    </div>
  );
}

const MATCHES_PER_PAGE = 10;

// Queue ID to game mode mapping
const QUEUE_NAMES: Record<number, string> = {
  400: "Normal Draft",
  420: "Ranked Solo",
  430: "Normal Blind",
  440: "Ranked Flex",
  450: "ARAM",
  700: "Clash",
  830: "Co-op vs AI (Intro)",
  840: "Co-op vs AI (Beginner)",
  850: "Co-op vs AI (Intermediate)",
  900: "URF",
  1020: "One for All",
  1300: "Nexus Blitz",
  1400: "Ultimate Spellbook",
  1700: "Arena",
  1900: "URF",
};

function getQueueName(queueId: number): string {
  return QUEUE_NAMES[queueId] || `Queue ${queueId}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupMatchesByDay(matches: ProcessedMatch[]): Map<string, ProcessedMatch[]> {
  const groups = new Map<string, ProcessedMatch[]>();
  for (const match of matches) {
    const dateKey = new Date(match.gameCreation).toDateString();
    const existing = groups.get(dateKey) || [];
    existing.push(match);
    groups.set(dateKey, existing);
  }
  return groups;
}

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `${params.gameName}#${params.tagLine} - Rift Legends` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { gameName, tagLine } = params;

  let version = "14.10.1";
  try {
    version = await getCurrentVersion();
  } catch {
    // Fall back
  }

  // Look up account
  let puuid: string;
  let actualGameName = gameName;
  let actualTagLine = tagLine;

  try {
    const account = await getAccountByRiotId(gameName, tagLine);
    puuid = account.puuid;
    actualGameName = account.gameName;
    actualTagLine = account.tagLine;
  } catch (e) {
    if (e instanceof RiotApiError && e.status === 404) {
      return {
        version,
        gameName,
        tagLine,
        profileIconId: null,
        puuid: null,
        ranked: null,
        matches: [],
        start: 0,
        hasMore: false,
        error: "Player not found",
      };
    }
    return {
      version,
      gameName,
      tagLine,
      profileIconId: null,
      puuid: null,
      ranked: null,
      matches: [],
      start: 0,
      hasMore: false,
      error: "Failed to look up player",
    };
  }

  // Get summoner for profile icon and ranked data in parallel
  let profileIconId: number | null = null;
  let ranked: RankedInfo | null = null;

  try {
    const [summoner, rankedData] = await Promise.all([
      getSummonerByPuuid(puuid),
      getRankedByPuuid(puuid),
    ]);
    profileIconId = summoner.profileIconId;
    ranked = rankedData;
  } catch {
    // Non-critical
  }

  // Load matches
  const url = new URL(request.url);
  const start = parseInt(url.searchParams.get("start") || "0", 10);

  try {
    const matchIds = await getMatchIdsForPuuid(puuid, MATCHES_PER_PAGE, start);

    const matches = (
      await Promise.all(matchIds.map((id) => getProcessedMatch(id, puuid)))
    ).filter((m): m is ProcessedMatch => m !== null);

    return {
      version,
      gameName: actualGameName,
      tagLine: actualTagLine,
      profileIconId,
      puuid,
      ranked,
      matches,
      start,
      hasMore: matchIds.length === MATCHES_PER_PAGE,
    };
  } catch {
    return {
      version,
      gameName: actualGameName,
      tagLine: actualTagLine,
      profileIconId,
      puuid,
      ranked,
      matches: [],
      start: 0,
      hasMore: false,
      error: "Failed to load match history",
    };
  }
}

export default function PlayerPage({ loaderData }: Route.ComponentProps) {
  const {
    version,
    gameName,
    tagLine,
    profileIconId,
    ranked,
    matches: initialMatches,
    start,
    hasMore,
    error,
  } = loaderData;

  const [matches, setMatches] = useState<ProcessedMatch[]>(initialMatches);
  const [currentStart, setCurrentStart] = useState(start);
  const [canLoadMore, setCanLoadMore] = useState(hasMore);
  const [selectedQueue, setSelectedQueue] = useState<number | null>(null);
  const fetcher = useFetcher<typeof loader>();

  // Reset state when navigating to a different player
  useEffect(() => {
    setMatches(initialMatches);
    setCurrentStart(start);
    setCanLoadMore(hasMore);
    setSelectedQueue(null);
  }, [gameName, tagLine, initialMatches, start, hasMore]);

  // Append new matches when fetcher returns data
  useEffect(() => {
    if (fetcher.data?.matches && fetcher.data.start > currentStart) {
      setMatches((prev) => [...prev, ...fetcher.data!.matches]);
      setCurrentStart(fetcher.data.start);
      setCanLoadMore(fetcher.data.hasMore ?? false);
    }
  }, [fetcher.data, currentStart]);

  // Get unique queue IDs for filter
  const availableQueues = useMemo(() => {
    const queues = new Set(matches.map((m) => m.queueId));
    return Array.from(queues).sort((a, b) => {
      const nameA = getQueueName(a);
      const nameB = getQueueName(b);
      return nameA.localeCompare(nameB);
    });
  }, [matches]);

  // Filter and group matches
  const filteredMatches = useMemo(() => {
    if (selectedQueue === null) return matches;
    return matches.filter((m) => m.queueId === selectedQueue);
  }, [matches, selectedQueue]);

  const groupedMatches = useMemo(() => {
    return groupMatchesByDay(filteredMatches);
  }, [filteredMatches]);

  function loadMore() {
    const nextStart = currentStart + MATCHES_PER_PAGE;
    fetcher.load(`?start=${nextStart}`);
  }

  const isLoadingMore = fetcher.state === "loading";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm">
        <ol className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <li>
            <Link to="/" className="hover:text-gray-900 dark:hover:text-white">
              Home
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-900 dark:text-white">
            {gameName}#{tagLine}
          </li>
        </ol>
      </nav>

      {/* Player Header */}
      <div className="mb-6 flex items-center gap-4">
        {profileIconId != null ? (
          <img
            src={profileIconUrl(version, profileIconId)}
            alt=""
            className="h-16 w-16 rounded-full"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            ?
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {gameName}
            <span className="text-gray-400">#{tagLine}</span>
          </h1>
          {ranked ? (
            <RankBadge ranked={ranked} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Unranked</p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
      {availableQueues.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedQueue(null)}
            className={`cursor-pointer rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              selectedQueue === null
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            All
          </button>
          {availableQueues.map((queueId) => (
            <button
              key={queueId}
              type="button"
              onClick={() => setSelectedQueue(queueId)}
              className={`cursor-pointer rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                selectedQueue === queueId
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {getQueueName(queueId)}
            </button>
          ))}
        </div>
      )}

      {/* Match List grouped by day */}
      <div className="space-y-6">
        {filteredMatches.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <p className="text-gray-500 dark:text-gray-400">
              {selectedQueue !== null
                ? "No matches for this game mode"
                : "No recent matches found"}
            </p>
          </div>
        )}
        {Array.from(groupedMatches.entries()).map(([dateKey, dayMatches]) => (
          <div key={dateKey}>
            <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
              {formatDate(dayMatches[0].gameCreation)}
            </h2>
            <div className="space-y-1.5">
              {dayMatches.map((match) => (
                <MatchCard key={match.matchId} match={match} version={version} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Load More */}
      {canLoadMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="cursor-pointer rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Loading...
              </span>
            ) : (
              "Load More Games"
            )}
          </button>
        </div>
      )}
    </main>
  );
}
