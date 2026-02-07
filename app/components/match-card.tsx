import { Link } from "react-router";
import type { ProcessedMatch } from "~/lib/types";
import {
  spriteStyle,
  SUMMONER_SPELL_MAP,
  QUEUE_TYPE_MAP,
} from "~/lib/ddragon";
import type { SpriteData } from "~/lib/ddragon";
import { formatKDA, kdaRatio, formatDuration, timeAgo, riftScore, riftScoreColor } from "~/lib/utils";

export function MatchCard({
  match,
  version,
  sprites,
}: {
  match: ProcessedMatch;
  version: string;
  sprites: SpriteData;
}) {
  const bgClass = match.win
    ? "bg-blue-50 border-l-blue-500 dark:bg-blue-950/30 dark:border-l-blue-400"
    : "bg-red-50 border-l-red-500 dark:bg-red-950/30 dark:border-l-red-400";

  const spell1 = SUMMONER_SPELL_MAP[match.summoner1Id] || "SummonerFlash";
  const spell2 = SUMMONER_SPELL_MAP[match.summoner2Id] || "SummonerFlash";
  const queueName = QUEUE_TYPE_MAP[match.queueId] || "Game";
  const score = riftScore(match);
  const scoreColor = riftScoreColor(score);

  const champCoords = sprites.champions[match.championName];
  const spell1Coords = sprites.spells[spell1];
  const spell2Coords = sprites.spells[spell2];

  return (
    <Link
      to={`/matches/${match.matchId}`}
      className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2 transition-opacity hover:opacity-80 ${bgClass}`}
    >
      {/* Champion Icon + Level */}
      <div className="relative flex-shrink-0">
        {champCoords ? (
          <div
            className="rounded-full"
            style={spriteStyle(version, champCoords, sprites.sheetSizes, 40)}
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />
        )}
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white">
          {match.champLevel}
        </span>
      </div>

      {/* Summoner Spells */}
      <div className="flex flex-shrink-0 flex-col gap-0.5">
        {spell1Coords ? (
          <div
            className="rounded"
            style={spriteStyle(version, spell1Coords, sprites.sheetSizes, 20)}
          />
        ) : (
          <div className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-700" />
        )}
        {spell2Coords ? (
          <div
            className="rounded"
            style={spriteStyle(version, spell2Coords, sprites.sheetSizes, 20)}
          />
        ) : (
          <div className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-700" />
        )}
      </div>

      {/* KDA */}
      <div className="min-w-[70px] flex-shrink-0 text-center">
        <p className="text-sm font-bold text-gray-900 dark:text-white">
          {formatKDA(match.kills, match.deaths, match.assists)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {kdaRatio(match.kills, match.deaths, match.assists)} KDA
        </p>
      </div>

      {/* Rift Score */}
      <div className="min-w-[40px] flex-shrink-0 text-center">
        <div className="flex items-center justify-center gap-1">
          <p className={`text-sm font-bold ${scoreColor}`}>
            {score.toFixed(1)}
          </p>
          {match.isMvp && (
            <span className="rounded bg-amber-500 px-1 py-0.5 text-[10px] font-bold text-white">
              MVP
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500" title="Rift Score — performance rating based on KDA, damage, CS, gold, and vision">RS</p>
      </div>

      {/* CS */}
      <div className="min-w-[55px] flex-shrink-0 text-center">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {match.cs} CS
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {match.csPerMin}/min
        </p>
      </div>

      {/* Vision */}
      <div className="hidden min-w-[35px] flex-shrink-0 text-center sm:block">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {match.visionScore}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">vision</p>
      </div>

      {/* Items */}
      <div className="hidden flex-shrink-0 items-center gap-0.5 md:flex">
        {match.items.map((itemId, i) => (
          <div key={i} className="h-6 w-6">
            {itemId > 0 && sprites.items[String(itemId)] ? (
              <div
                className="rounded"
                style={spriteStyle(version, sprites.items[String(itemId)], sprites.sheetSizes, 24)}
              />
            ) : (
              <div className="h-6 w-6 rounded bg-gray-300 dark:bg-gray-700" />
            )}
          </div>
        ))}
        <div className="ml-0.5 h-6 w-6">
          {match.trinket > 0 && sprites.items[String(match.trinket)] ? (
            <div
              className="rounded-full"
              style={spriteStyle(version, sprites.items[String(match.trinket)], sprites.sheetSizes, 24)}
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-gray-300 dark:bg-gray-700" />
          )}
        </div>
      </div>

      {/* Game Info */}
      <div className="ml-auto flex-shrink-0 text-right">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {match.win ? "Victory" : "Defeat"}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatDuration(match.gameDuration)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {queueName} &middot; {timeAgo(match.gameCreation)}
        </p>
      </div>
    </Link>
  );
}
