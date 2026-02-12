import { getTeamMemberById } from "~/lib/db.server";
import { getMemberMatchHistory } from "~/lib/riot-api.server";
import type { Route } from "./+types/api.member-history.$memberId";

export async function loader({ params }: Route.LoaderArgs) {
  console.log(`[member-history] hit for memberId=${params.memberId}`);
  const memberId = parseInt(params.memberId, 10);
  if (isNaN(memberId)) {
    throw new Response("Invalid member ID", { status: 400 });
  }

  const member = getTeamMemberById(memberId);
  if (!member) {
    throw new Response("Member not found", { status: 404 });
  }

  const result = await getMemberMatchHistory(member);
  return Response.json(result);
}
