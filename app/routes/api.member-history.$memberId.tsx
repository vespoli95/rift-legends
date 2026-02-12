import { getTeamMemberById } from "~/lib/db.server";
import { getMemberMatchHistory } from "~/lib/riot-api.server";
import type { Route } from "./+types/api.member-history.$memberId";

export async function loader({ params }: Route.LoaderArgs) {
  const memberId = parseInt(params.memberId, 10);
  if (isNaN(memberId)) {
    throw new Response("Invalid member ID", { status: 400 });
  }

  const member = getTeamMemberById(memberId);
  if (!member) {
    throw new Response("Member not found", { status: 404 });
  }

  const t0 = Date.now();
  console.log(`[api] member-history/${memberId} start (${member.game_name}#${member.tag_line})`);
  const result = await getMemberMatchHistory(member);
  console.log(`[api] member-history/${memberId} done in ${Date.now() - t0}ms (${result.matches.length} matches, ${result.recentGameCount ?? "?"} recent)`);
  return Response.json(result);
}
