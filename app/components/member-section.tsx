import { Form, Link } from "react-router";
import type { MemberWithMatches, RankedInfo } from "~/lib/types";
import { profileIconUrl } from "~/lib/ddragon";
import { MatchCard } from "./match-card";
import { ErrorPanel } from "./error-panel";

const DEFAULT_VISIBLE = 3;

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

function formatRank(ranked: RankedInfo): string {
  const tier = ranked.tier.charAt(0) + ranked.tier.slice(1).toLowerCase();
  return `${tier} ${ranked.rank}`;
}

function RankBadge({ ranked }: { ranked: RankedInfo }) {
  const colorClass = TIER_COLORS[ranked.tier] || "text-gray-500";
  return (
    <span className={`text-xs font-medium ${colorClass}`}>
      {formatRank(ranked)} · {ranked.lp} LP
    </span>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function MemberSection({
  data,
  version,
  isEditing = false,
}: {
  data: MemberWithMatches;
  version: string;
  isEditing?: boolean;
}) {
  const { member, matches, ranked, error } = data;

  const visibleMatches = matches.slice(0, DEFAULT_VISIBLE);
  const hasMore = matches.length > DEFAULT_VISIBLE;
  const playerUrl = `/players/${encodeURIComponent(member.game_name)}/${encodeURIComponent(member.tag_line)}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {/* Member Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <Link
          to={playerUrl}
          className="flex cursor-pointer items-center gap-3 hover:opacity-80"
        >
          {member.profile_icon_id != null ? (
            <img
              src={profileIconUrl(version, member.profile_icon_id)}
              alt=""
              className="h-8 w-8 rounded-full"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              ?
            </span>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {member.game_name}
                <span className="text-gray-400">#{member.tag_line}</span>
              </h3>
              {ranked && <RankBadge ranked={ranked} />}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {ranked ? `${ranked.wins}W ${ranked.losses}L` : "View all games"}
            </p>
          </div>
        </Link>
        {isEditing && (
          <Form method="post">
            <input type="hidden" name="intent" value="remove-member" />
            <input type="hidden" name="memberId" value={member.id} />
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-red-100 p-2.5 text-red-600 hover:bg-red-200 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
              title="Remove from team"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </Form>
        )}
      </div>

      {/* Content */}
      <div className="space-y-1.5 p-3">
        {error && <ErrorPanel message={error} />}
        {matches.length === 0 && !error && (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No recent matches found
          </p>
        )}
        {visibleMatches.map((match) => (
          <MatchCard key={match.matchId} match={match} version={version} />
        ))}
        {hasMore && (
          <Link
            to={playerUrl}
            className="block w-full cursor-pointer rounded-lg py-2 text-center text-sm text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
          >
            View all {matches.length} games
          </Link>
        )}
      </div>
    </div>
  );
}
