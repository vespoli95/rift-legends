import { getActiveGame } from "~/lib/riot-api.server";
import type { Route } from "./+types/api.live-game.$puuid";

export async function loader({ params }: Route.LoaderArgs) {
  const { puuid } = params;
  if (!puuid) {
    throw new Response("Missing puuid", { status: 400 });
  }

  const game = await getActiveGame(puuid);
  return Response.json({ game });
}
