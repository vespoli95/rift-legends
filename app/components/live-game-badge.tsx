import { useEffect, useState } from "react";
import type { ActiveGameInfo } from "~/lib/types";
import type { SpriteData } from "~/lib/ddragon";
import { spriteStyle } from "~/lib/ddragon";

const GAME_MODE_NAMES: Record<string, string> = {
  CLASSIC: "Summoner's Rift",
  ARAM: "ARAM",
  URF: "URF",
  ONEFORALL: "One for All",
  CHERRY: "Arena",
  NEXUSBLITZ: "Nexus Blitz",
  ULTBOOK: "Ultimate Spellbook",
};

function formatElapsed(startTime: number): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function LiveGameBadge({
  game,
  sprites,
  version,
  compact = false,
}: {
  game: ActiveGameInfo;
  sprites: SpriteData;
  version: string;
  compact?: boolean;
}) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(game.gameStartTime));

  useEffect(() => {
    setElapsed(formatElapsed(game.gameStartTime));
    const interval = setInterval(() => {
      setElapsed(formatElapsed(game.gameStartTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [game.gameStartTime]);

  const championKey = sprites.championById[game.championId];
  const championSprite = championKey ? sprites.champions[championKey] : undefined;
  const championName = championKey ? (sprites.championNames[championKey] || championKey) : undefined;
  const modeName = GAME_MODE_NAMES[game.gameMode] || game.gameMode;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="text-xs font-semibold text-green-600 dark:text-green-400">LIVE</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-green-50 px-2.5 py-1 dark:bg-green-950/40">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      <span className="text-xs font-semibold text-green-600 dark:text-green-400">LIVE</span>
      {championSprite && (
        <div
          className="shrink-0 rounded"
          style={spriteStyle(version, championSprite, sprites.sheetSizes, 18)}
          title={championName}
        />
      )}
      <span className="text-xs text-gray-600 dark:text-gray-400">{modeName}</span>
      <span className="text-xs tabular-nums text-gray-500 dark:text-gray-500">{elapsed}</span>
    </div>
  );
}
