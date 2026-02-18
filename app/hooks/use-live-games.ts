import { useEffect, useRef, useState } from "react";
import type { ActiveGameInfo } from "~/lib/types";

const POLL_INTERVAL = 45_000;

export function useLiveGames(teamId: number): Record<number, ActiveGameInfo | null> {
  const [games, setGames] = useState<Record<number, ActiveGameInfo | null>>(() => ({}));
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/live-games/${teamId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setGames(data.games ?? {});
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
  }, [teamId]);

  return games;
}
