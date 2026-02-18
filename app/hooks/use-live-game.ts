import { useEffect, useRef, useState } from "react";
import type { ActiveGameInfo } from "~/lib/types";

const POLL_INTERVAL = 45_000;

export function useLiveGame(puuid: string | null): ActiveGameInfo | null {
  const [game, setGame] = useState<ActiveGameInfo | null>(() => null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!puuid) return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/live-game/${puuid}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setGame(data.game ?? null);
      } catch {
        // ignore
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [puuid]);

  return game;
}
