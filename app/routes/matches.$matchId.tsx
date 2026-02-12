import { Link } from "react-router";
import type { Route } from "./+types/matches.$matchId";
import { getMatchDetail, getRankedByPuuid } from "~/lib/riot-api.server";
import type { RankedData } from "~/lib/riot-api.server";
import { getCurrentVersion, getSpriteData } from "~/lib/ddragon.server";
import {
  spriteStyle,
  SUMMONER_SPELL_MAP,
  QUEUE_TYPE_MAP,
} from "~/lib/ddragon";
import type { SpriteData } from "~/lib/ddragon";
import {
  formatKDA,
  kdaRatio,
  formatDuration,
  timeAgo,
  participantRiftScore,
  riftScoreColor,
  ordinalSuffix,
} from "~/lib/utils";
import type { MatchParticipant } from "~/lib/types";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Match - Rift Legends" }];
  const queue = QUEUE_TYPE_MAP[data.match.info.queueId] || "Game";
  return [{ title: `${queue} Match - Rift Legends` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const match = await getMatchDetail(params.matchId);

  let version = "14.10.1";
  try {
    version = await getCurrentVersion();
  } catch {
    // Fall back to a reasonable default
  }

  const scores = match.info.participants.map((p) => ({
    puuid: p.puuid,
    score: participantRiftScore(p, match.info.gameDuration),
  }));

  const scoreMap: Record<string, number> = {};
  for (const s of scores) {
    scoreMap[s.puuid] = s.score;
  }

  // Compute rank for each participant (ties broken by KDA ratio)
  const kdaMap: Record<string, number> = {};
  for (const p of match.info.participants) {
    kdaMap[p.puuid] = p.deaths === 0 ? p.kills + p.assists + 1000 : (p.kills + p.assists) / p.deaths;
  }

  const rankMap: Record<string, number> = {};
  for (const s of scores) {
    const higherCount = scores.filter(
      (o) => o.score > s.score || (o.score === s.score && (kdaMap[o.puuid] ?? 0) > (kdaMap[s.puuid] ?? 0)),
    ).length;
    rankMap[s.puuid] = higherCount + 1;
  }

  // Fetch ranked data and sprite data in parallel
  const [rankedResults, sprites] = await Promise.all([
    Promise.all(
      match.info.participants.map(async (p) => {
        try {
          return { puuid: p.puuid, ranked: await getRankedByPuuid(p.puuid) };
        } catch {
          return { puuid: p.puuid, ranked: null };
        }
      }),
    ),
    getSpriteData(version),
  ]);

  const rankedMap: Record<string, RankedData | null> = {};
  for (const r of rankedResults) {
    rankedMap[r.puuid] = r.ranked;
  }

  return { match, version, scoreMap, rankMap, rankedMap, sprites };
}

const POSITION_ICON: Record<string, string> = {
  TOP: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-top.svg",
  JUNGLE: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-jungle.svg",
  MIDDLE: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-middle.svg",
  BOTTOM: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-bottom.svg",
  UTILITY: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-utility.svg",
};

const POSITION_LABEL: Record<string, string> = {
  TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support",
};

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

function formatRank(ranked: RankedData): string {
  const tier = ranked.tier.charAt(0) + ranked.tier.slice(1).toLowerCase();
  return `${tier} ${ranked.rank}`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function ParticipantRow({
  participant,
  version,
  score,
  rank,
  ranked,
  sprites,
  maxDamage,
  maxDamageTaken,
}: {
  participant: MatchParticipant;
  version: string;
  score: number;
  rank: number;
  ranked: RankedData | null;
  sprites: SpriteData;
  maxDamage: number;
  maxDamageTaken: number;
}) {
  const spell1 = SUMMONER_SPELL_MAP[participant.summoner1Id] || "SummonerFlash";
  const spell2 = SUMMONER_SPELL_MAP[participant.summoner2Id] || "SummonerFlash";
  const totalCs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const scoreColor = riftScoreColor(score);
  const items = [
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
  ];
  const champCoords = sprites.champions?.[participant.championName];
  const spell1Coords = sprites.spells?.[spell1];
  const spell2Coords = sprites.spells?.[spell2];

  return (
    <tr className="border-b border-gray-200 last:border-b-0 dark:border-gray-700">
      {/* Champion + Spells + Role */}
      <td className="py-2 pl-3 pr-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-shrink-0" title={sprites.championNames?.[participant.championName] || participant.championName}>
            {champCoords ? (
              <div
                className="rounded-full"
                style={spriteStyle(version, champCoords, sprites.sheetSizes, 32)}
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-700" />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-[9px] font-bold text-white">
              {participant.champLevel}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {spell1Coords ? (
              <div className="rounded" title={sprites.spellNames?.[spell1] || spell1} style={spriteStyle(version, spell1Coords, sprites.sheetSizes, 16)} />
            ) : (
              <div className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-700" />
            )}
            {spell2Coords ? (
              <div className="rounded" title={sprites.spellNames?.[spell2] || spell2} style={spriteStyle(version, spell2Coords, sprites.sheetSizes, 16)} />
            ) : (
              <div className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-700" />
            )}
          </div>
          {POSITION_ICON[participant.teamPosition] && (
            <img
              src={POSITION_ICON[participant.teamPosition]}
              alt={POSITION_LABEL[participant.teamPosition] || participant.teamPosition}
              title={POSITION_LABEL[participant.teamPosition] || participant.teamPosition}
              className="h-5 w-5 opacity-70"
            />
          )}
        </div>
      </td>

      {/* Player Name + Rank */}
      <td className="px-2 py-2">
        <Link
          to={`/players/${encodeURIComponent(participant.riotIdGameName)}/${encodeURIComponent(participant.riotIdTagline)}`}
          className="text-sm font-medium text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
        >
          {participant.riotIdGameName}
          <span className="text-xs text-gray-400">#{participant.riotIdTagline}</span>
        </Link>
        {ranked && (
          <p
            className={`text-[11px] font-medium ${TIER_COLORS[ranked.tier] || "text-gray-500"}`}
            title="Ranked Solo/Duo"
          >
            {formatRank(ranked)}
          </p>
        )}
      </td>

      {/* KDA */}
      <td className="px-2 py-2 text-center">
        <p className="text-sm font-bold text-gray-900 dark:text-white">
          {formatKDA(participant.kills, participant.deaths, participant.assists)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {kdaRatio(participant.kills, participant.deaths, participant.assists)}
        </p>
      </td>

      {/* Rift Score + Rank */}
      <td className="px-2 py-2 text-center">
        <div className="flex items-center justify-center gap-1">
          <span className={`text-sm font-bold ${scoreColor}`}>
            {score.toFixed(1)}
          </span>
          {rank === 1 ? (
            <span className="rounded bg-amber-500 px-1 py-0.5 text-[10px] font-bold text-white">
              MVP
            </span>
          ) : rank <= 3 ? (
            <span className="rounded bg-indigo-500 px-1 py-0.5 text-[10px] font-bold text-white">
              {ordinalSuffix(rank)}
            </span>
          ) : (
            <span className="rounded bg-gray-400 px-1 py-0.5 text-[10px] font-bold text-white dark:bg-gray-600">
              {ordinalSuffix(rank)}
            </span>
          )}
        </div>
        <p
          className="text-[10px] text-gray-400 dark:text-gray-500"
          title="Rift Score — performance rating based on KDA, damage, CS, gold, and vision"
        >
          RS
        </p>
      </td>

      {/* CS */}
      <td className="hidden px-2 py-2 text-center sm:table-cell">
        <p className="text-sm text-gray-700 dark:text-gray-300">{totalCs}</p>
      </td>

      {/* Damage */}
      <td className="hidden px-2 py-2 md:table-cell">
        <div className="relative mx-auto h-5 w-20 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
          <div
            className={`absolute inset-y-0 left-0 rounded ${participant.win ? "bg-blue-400 dark:bg-blue-500" : "bg-red-400 dark:bg-red-500"}`}
            style={{ width: `${maxDamage > 0 ? (participant.totalDamageDealtToChampions / maxDamage) * 100 : 0}%` }}
          />
          <span className="relative z-10 flex h-full items-center justify-center text-[10px] font-semibold text-gray-900 dark:text-white">
            {formatNumber(participant.totalDamageDealtToChampions)}
          </span>
        </div>
      </td>

      {/* Damage Taken */}
      <td className="hidden px-2 py-2 md:table-cell">
        <div className="relative mx-auto h-5 w-20 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
          <div
            className="absolute inset-y-0 left-0 rounded bg-emerald-400 dark:bg-emerald-500"
            style={{ width: `${maxDamageTaken > 0 ? (participant.totalDamageTaken / maxDamageTaken) * 100 : 0}%` }}
          />
          <span className="relative z-10 flex h-full items-center justify-center text-[10px] font-semibold text-gray-900 dark:text-white">
            {formatNumber(participant.totalDamageTaken)}
          </span>
        </div>
      </td>

      {/* Gold */}
      <td className="hidden px-2 py-2 text-center md:table-cell">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {formatNumber(participant.goldEarned)}
        </p>
      </td>

      {/* Vision */}
      <td className="hidden px-2 py-2 text-center lg:table-cell">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {participant.visionScore}
        </p>
      </td>

      {/* Items */}
      <td className="hidden py-2 pl-2 pr-3 lg:table-cell">
        <div className="flex items-center gap-0.5">
          {items.map((itemId, i) => (
            <div key={i} className="h-6 w-6" title={itemId > 0 ? sprites.itemNames?.[String(itemId)] || "" : ""}>
              {itemId > 0 && sprites.items?.[String(itemId)] ? (
                <div
                  className="rounded"
                  style={spriteStyle(version, sprites.items[String(itemId)], sprites.sheetSizes, 24)}
                />
              ) : (
                <div className="h-6 w-6 rounded bg-gray-300 dark:bg-gray-700" />
              )}
            </div>
          ))}
          <div className="ml-0.5 h-6 w-6" title={participant.item6 > 0 ? sprites.itemNames?.[String(participant.item6)] || "" : ""}>
            {participant.item6 > 0 && sprites.items?.[String(participant.item6)] ? (
              <div
                className="rounded-full"
                style={spriteStyle(version, sprites.items[String(participant.item6)], sprites.sheetSizes, 24)}
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-gray-300 dark:bg-gray-700" />
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function TeamTable({
  participants,
  version,
  scoreMap,
  rankMap,
  isWinner,
  rankedMap,
  sprites,
}: {
  participants: MatchParticipant[];
  version: string;
  scoreMap: Record<string, number>;
  rankMap: Record<string, number>;
  isWinner: boolean;
  rankedMap: Record<string, RankedData | null>;
  sprites: SpriteData;
}) {
  // Sort participants by rift score descending
  const sorted = [...participants].sort(
    (a, b) => (scoreMap[b.puuid] ?? 0) - (scoreMap[a.puuid] ?? 0),
  );
  const maxDamage = Math.max(...participants.map((p) => p.totalDamageDealtToChampions));
  const maxDamageTaken = Math.max(...participants.map((p) => p.totalDamageTaken));
  const borderColor = isWinner
    ? "border-l-blue-500 dark:border-l-blue-400"
    : "border-l-red-500 dark:border-l-red-400";

  return (
    <div className={`overflow-x-auto rounded-lg border-l-4 ${borderColor} bg-white dark:bg-gray-900`}>
      <div className="flex items-center gap-2 px-4 py-2">
        <span
          className={`text-sm font-bold ${
            isWinner
              ? "text-blue-600 dark:text-blue-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {isWinner ? "Victory" : "Defeat"}
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[10px] text-gray-400 dark:text-gray-500">
            <th colSpan={5} />
            <th colSpan={2} className="hidden border-b border-gray-200 pb-0 pt-1 text-center font-medium md:table-cell dark:border-gray-700">Damage</th>
            <th colSpan={3} />
          </tr>
          <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <th className="py-1 pl-3 pr-2 text-left font-medium">Champ</th>
            <th className="px-2 py-1 text-left font-medium">Player</th>
            <th className="px-2 py-1 text-center font-medium">KDA</th>
            <th className="px-2 py-1 text-center font-medium">RS</th>
            <th className="hidden px-2 py-1 text-center font-medium sm:table-cell">CS</th>
            <th className="hidden px-2 py-1 text-center font-medium md:table-cell">Done</th>
            <th className="hidden px-2 py-1 text-center font-medium md:table-cell">Taken</th>
            <th className="hidden px-2 py-1 text-center font-medium md:table-cell">Gold</th>
            <th className="hidden px-2 py-1 text-center font-medium lg:table-cell">Vision</th>
            <th className="hidden py-1 pl-2 pr-3 text-left font-medium lg:table-cell">Items</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <ParticipantRow
              key={p.puuid}
              participant={p}
              version={version}
              score={scoreMap[p.puuid] ?? 0}
              rank={rankMap[p.puuid] ?? 10}
              ranked={rankedMap[p.puuid] ?? null}
              sprites={sprites}
              maxDamage={maxDamage}
              maxDamageTaken={maxDamageTaken}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MatchDetail({ loaderData }: Route.ComponentProps) {
  const { match, version, scoreMap, rankMap, rankedMap, sprites } = loaderData;
  const { info } = match;

  const queueName = QUEUE_TYPE_MAP[info.queueId] || "Game";

  // Split participants by team (first 5 = blue side, last 5 = red side)
  const blueSide = info.participants.slice(0, 5);
  const redSide = info.participants.slice(5, 10);
  const blueWon = blueSide[0]?.win ?? true;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/"
          className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          &larr; Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
          {queueName}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {formatDuration(info.gameDuration)} &middot; {timeAgo(info.gameCreation)}
        </p>
      </div>

      {/* Teams */}
      <div className="space-y-6">
        <TeamTable
          participants={blueSide}
          version={version}
          scoreMap={scoreMap}
          rankMap={rankMap}
          isWinner={blueWon}
          rankedMap={rankedMap}
          sprites={sprites}
        />
        <TeamTable
          participants={redSide}
          version={version}
          scoreMap={scoreMap}
          rankMap={rankMap}
          isWinner={!blueWon}
          rankedMap={rankedMap}
          sprites={sprites}
        />
      </div>
    </main>
  );
}
