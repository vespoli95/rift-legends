import { Form, Link } from "react-router";
import type { MemberWithMatches, RankedInfo, TeamMember, ActiveGameInfo } from "~/lib/types";
import { profileIconUrl } from "~/lib/ddragon";
import type { SpriteData } from "~/lib/ddragon";
import { MatchCard } from "./match-card";
import { LiveGameBadge } from "./live-game-badge";

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
    <span className={`text-xs font-medium ${colorClass}`} title="Ranked Solo/Duo">
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

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function MemberHeader({
  member,
  version,
  ranked,
  isEditing,
  liveGame,
  sprites,
}: {
  member: TeamMember;
  version: string;
  ranked?: RankedInfo | null;
  isEditing?: boolean;
  liveGame?: ActiveGameInfo | null;
  sprites?: SpriteData;
}) {
  const playerUrl = `/players/${encodeURIComponent(member.game_name)}/${encodeURIComponent(member.tag_line)}`;

  return (
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
            {liveGame && sprites && (
              <LiveGameBadge game={liveGame} sprites={sprites} version={version} />
            )}
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
  );
}

export function MemberSection({
  data,
  version,
  sprites,
  isEditing = false,
  retrying = false,
  onRetry,
  liveGame,
}: {
  data: MemberWithMatches;
  version: string;
  sprites: SpriteData;
  isEditing?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
  liveGame?: ActiveGameInfo | null;
}) {
  const { member, matches, ranked, error } = data;

  const visibleMatches = matches.slice(0, DEFAULT_VISIBLE);
  const hasMore = matches.length > DEFAULT_VISIBLE;
  const playerUrl = `/players/${encodeURIComponent(member.game_name)}/${encodeURIComponent(member.tag_line)}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <MemberHeader member={member} version={version} ranked={ranked} isEditing={isEditing} liveGame={liveGame} sprites={sprites} />

      {/* Content */}
      <div className="space-y-1.5 p-3">
        {error && matches.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-4">
            {retrying ? (
              <>
                <Spinner className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Loading failed — retrying...
                </span>
              </>
            ) : onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="cursor-pointer text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Failed to load — tap to retry
              </button>
            ) : (
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
            )}
          </div>
        )}
        {error && matches.length > 0 && (
          <p className="text-center text-xs text-amber-600 dark:text-amber-400">{error}</p>
        )}
        {matches.length === 0 && !error && (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No recent matches found
          </p>
        )}
        {visibleMatches.map((match) => (
          <MatchCard key={match.matchId} match={match} version={version} sprites={sprites} />
        ))}
        {hasMore && (
          <Link
            to={playerUrl}
            className="block w-full cursor-pointer rounded-lg py-2 text-center text-sm text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
          >
            View all games
          </Link>
        )}
      </div>
    </div>
  );
}

export function MemberSectionSkeleton({
  member,
  version,
  isEditing = false,
}: {
  member: TeamMember;
  version: string;
  isEditing?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <MemberHeader member={member} version={version} isEditing={isEditing} />
      <div className="space-y-1.5 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" style={{ height: 72 }}>
            <div className="flex h-full items-center gap-3 px-3">
              <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-2.5 w-16 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MemberCard({
  data,
  version,
  isEditing = false,
  retrying = false,
  onRetry,
  liveGame,
  sprites,
}: {
  data: MemberWithMatches;
  version: string;
  isEditing?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
  liveGame?: ActiveGameInfo | null;
  sprites?: SpriteData;
}) {
  const { member, matches, ranked, error } = data;
  const playerUrl = `/players/${encodeURIComponent(member.game_name)}/${encodeURIComponent(member.tag_line)}`;

  const wins = matches.filter((m) => m.win).length;
  const losses = matches.length - wins;

  return (
    <div className="relative rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      {isEditing && (
        <Form method="post" className="absolute right-2 top-2">
          <input type="hidden" name="intent" value="remove-member" />
          <input type="hidden" name="memberId" value={member.id} />
          <button
            type="submit"
            className="cursor-pointer rounded bg-red-100 p-1.5 text-red-600 hover:bg-red-200 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            title="Remove from team"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </Form>
      )}
      <Link to={playerUrl} className="flex flex-col items-center gap-2 hover:opacity-80">
        {member.profile_icon_id != null ? (
          <img
            src={profileIconUrl(version, member.profile_icon_id)}
            alt=""
            className="h-14 w-14 rounded-full"
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-lg text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            ?
          </span>
        )}
        <div className="text-center">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {member.game_name}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">#{member.tag_line}</p>
        </div>
        {ranked && <RankBadge ranked={ranked} />}
        {liveGame && sprites && (
          <LiveGameBadge game={liveGame} sprites={sprites} version={version} compact />
        )}
        {matches.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="text-green-600 dark:text-green-400">{wins}W</span>
            {" "}
            <span className="text-red-600 dark:text-red-400">{losses}L</span>
            <span className="ml-1 text-gray-400">({matches.length} games)</span>
          </p>
        )}
      </Link>
      {error && matches.length === 0 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {retrying ? (
            <>
              <Spinner className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Retrying...</span>
            </>
          ) : onRetry ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onRetry(); }}
              className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Tap to retry
            </button>
          ) : (
            <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function MemberCardSkeleton({
  member,
  version,
  isEditing = false,
}: {
  member: TeamMember;
  version: string;
  isEditing?: boolean;
}) {
  return (
    <div className="relative rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      {isEditing && (
        <Form method="post" className="absolute right-2 top-2">
          <input type="hidden" name="intent" value="remove-member" />
          <input type="hidden" name="memberId" value={member.id} />
          <button
            type="submit"
            className="cursor-pointer rounded bg-red-100 p-1.5 text-red-600 hover:bg-red-200 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            title="Remove from team"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </Form>
      )}
      <div className="flex flex-col items-center gap-2">
        {member.profile_icon_id != null ? (
          <img
            src={profileIconUrl(version, member.profile_icon_id)}
            alt=""
            className="h-14 w-14 rounded-full"
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-lg text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            ?
          </span>
        )}
        <div className="text-center">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {member.game_name}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">#{member.tag_line}</p>
        </div>
        <Spinner className="h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
}
