import { getTeamMembers } from "~/lib/db.server";
import { getActiveGamesForTeam } from "~/lib/riot-api.server";
import type { Route } from "./+types/api.live-games.$teamId";

export async function loader({ params }: Route.LoaderArgs) {
  const teamId = parseInt(params.teamId, 10);
  if (isNaN(teamId)) {
    throw new Response("Invalid team ID", { status: 400 });
  }

  const members = getTeamMembers(teamId);
  if (members.length === 0) {
    return Response.json({ games: {} });
  }

  const games = await getActiveGamesForTeam(members);
  return Response.json({ games });
}
