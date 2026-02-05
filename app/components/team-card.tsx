import { Link } from "react-router";
import type { TeamWithCount } from "~/lib/types";

export function TeamCard({ team }: { team: TeamWithCount }) {
  return (
    <Link
      to={`/teams/${team.slug}`}
      className="block rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
    >
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        {team.emoji && <span className="mr-2">{team.emoji}</span>}
        {team.name}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {team.member_count} {team.member_count === 1 ? "member" : "members"}
      </p>
    </Link>
  );
}
