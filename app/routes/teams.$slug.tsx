import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/teams.$slug";
import {
  getTeamBySlug,
  getTeamMembers,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  updateTeamEmoji,
} from "~/lib/db.server";
import { getCurrentVersion, getSpriteData } from "~/lib/ddragon.server";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  RiotApiError,
} from "~/lib/riot-api.server";
import { parseRiotId, timeAgo } from "~/lib/utils";
import { profileIconUrl } from "~/lib/ddragon";
import type { SpriteData } from "~/lib/ddragon";
import {
  MemberSection,
  MemberSectionSkeleton,
  MemberCard,
  MemberCardSkeleton,
} from "~/components/member-section";
import { MatchCard } from "~/components/match-card";
import { PlayerSearch } from "~/components/player-search";
import { EmojiPicker } from "~/components/emoji-picker";
import type { MemberWithMatches, ProcessedMatch, TeamMember } from "~/lib/types";

export function meta({ data }: Route.MetaArgs) {
  const teamName = data?.team?.name || "Team";
  return [{ title: `${teamName} - Rift Legends` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const team = getTeamBySlug(params.slug);
  if (!team) {
    throw new Response("Team not found", { status: 404 });
  }

  const members = getTeamMembers(team.id);

  let version = "14.10.1";
  try {
    version = await getCurrentVersion();
  } catch {
    // Fall back to a reasonable default
  }

  const sprites = await getSpriteData(version);

  return { team, members, version, sprites };
}

export async function action({ request, params }: Route.ActionArgs) {
  const team = getTeamBySlug(params.slug);
  if (!team) {
    throw new Response("Team not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add-member") {
    const riotId = ((formData.get("riotId") as string) || "").trim();

    if (!riotId) {
      return { error: "Riot ID is required" };
    }

    const parsed = parseRiotId(riotId);
    if (!parsed) {
      return {
        error: "Invalid Riot ID format. Use Name#TAG (e.g. Player#NA1)",
      };
    }

    try {
      const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine);

      let profileIconId: number | undefined;
      try {
        const summoner = await getSummonerByPuuid(account.puuid);
        profileIconId = summoner.profileIconId;
      } catch {
        // Non-critical
      }

      try {
        addTeamMember(
          team.id,
          account.gameName,
          account.tagLine,
          account.puuid,
          profileIconId,
        );
      } catch (e: unknown) {
        if (
          e instanceof Error &&
          e.message.includes("UNIQUE constraint failed")
        ) {
          return { error: "This player is already on the team" };
        }
        throw e;
      }

      return { success: true };
    } catch (e) {
      if (e instanceof RiotApiError) {
        if (e.status === 404) {
          return {
            error: "Summoner not found. Check the Riot ID and try again.",
          };
        }
        return { error: e.message };
      }
      return { error: "Failed to look up Riot ID" };
    }
  }

  if (intent === "remove-member") {
    const memberId = parseInt(formData.get("memberId") as string, 10);
    if (!isNaN(memberId)) {
      removeTeamMember(memberId, team.id);
    }
    return { success: true };
  }

  if (intent === "update-emoji") {
    const emoji = ((formData.get("emoji") as string) || "").trim();
    updateTeamEmoji(team.id, emoji);
    return { success: true };
  }

  if (intent === "delete-team") {
    deleteTeam(team.id);
    throw redirect("/");
  }

  return { error: "Unknown action" };
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M2 3.75A.75.75 0 012.75 3h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 3.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
    </svg>
  );
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group relative">
      {children}
      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow dark:bg-gray-700">
          {label}
        </div>
      </div>
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
  );
}

const MAX_RETRIES = 3;
const STAGGER_MS = 300;
const RETRY_DELAY_MS = 5000;

function useMemberData(members: TeamMember[]) {
  const [loadedData, setLoadedData] = useState<Map<number, MemberWithMatches>>(new Map());
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());

  // Track what we've started loading to avoid double-fetches
  const startedRef = useRef(new Set<number>());
  const retriesRef = useRef(new Map<number, number>());
  const abortRef = useRef<AbortController | null>(null);

  const fetchMember = useCallback((member: TeamMember, signal: AbortSignal, retryCount = 0) => {
    setRetryingIds((prev) => {
      if (retryCount > 0) {
        const next = new Set(prev);
        next.add(member.id);
        return next;
      }
      return prev;
    });

    fetch(`/api/member-history/${member.id}`, { signal })
      .then((res) => res.json() as Promise<MemberWithMatches>)
      .then((data) => {
        setLoadedData((prev) => new Map(prev).set(member.id, data));
        setRetryingIds((prev) => {
          if (!prev.has(member.id)) return prev;
          const next = new Set(prev);
          next.delete(member.id);
          return next;
        });

        // Auto-retry if error with no matches
        if (data.error && data.matches.length === 0 && retryCount < MAX_RETRIES) {
          retriesRef.current.set(member.id, retryCount + 1);
          setRetryingIds((prev) => {
            const next = new Set(prev);
            next.add(member.id);
            return next;
          });
          setTimeout(() => {
            if (!signal.aborted) {
              fetchMember(member, signal, retryCount + 1);
            }
          }, RETRY_DELAY_MS);
        }
      })
      .catch(() => {
        // Aborted or network error — ignore
      });
  }, []);

  // Kick off staggered fetches when members change
  const memberIdsKey = members.map((m) => m.id).join(",");

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    // Clean up state for removed members
    const currentIds = new Set(members.map((m) => m.id));
    for (const id of startedRef.current) {
      if (!currentIds.has(id)) startedRef.current.delete(id);
    }
    setLoadedData((prev) => {
      let needsClean = false;
      for (const id of prev.keys()) {
        if (!currentIds.has(id)) { needsClean = true; break; }
      }
      if (!needsClean) return prev;
      const next = new Map<number, MemberWithMatches>();
      for (const [id, data] of prev) {
        if (currentIds.has(id)) next.set(id, data);
      }
      return next;
    });

    // Fetch members we haven't started yet
    const toFetch = members.filter((m) => !startedRef.current.has(m.id));
    toFetch.forEach((member, i) => {
      startedRef.current.add(member.id);
      retriesRef.current.set(member.id, 0);
      setTimeout(() => {
        if (!controller.signal.aborted) {
          fetchMember(member, controller.signal);
        }
      }, i * STAGGER_MS);
    });

    return () => {
      controller.abort();
      // Don't clear startedRef — keep track of what we've already loaded
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIdsKey]);

  const manualRetry = useCallback((memberId: number) => {
    const member = members.find((m) => m.id === memberId);
    if (!member || !abortRef.current) return;
    retriesRef.current.set(memberId, 0);
    fetchMember(member, abortRef.current.signal, 0);
  }, [members, fetchMember]);

  // Has a member exhausted retries? (error + not retrying + retries >= MAX)
  const isMaxedOut = useCallback((memberId: number) => {
    return (retriesRef.current.get(memberId) ?? 0) >= MAX_RETRIES;
  }, []);

  return { loadedData, retryingIds, manualRetry, isMaxedOut };
}

export default function TeamDetail({ loaderData }: Route.ComponentProps) {
  const { team, members, version, sprites } = loaderData;
  const actionData = useActionData<typeof action>();
  const [isEditing, setIsEditing] = useState(false);
  const emojiFormRef = useRef<HTMLFormElement>(null);
  const lastMemberRef = useRef<HTMLDivElement>(null);
  const [searchKey, setSearchKey] = useState(0);
  const prevMemberCount = useRef(members.length);
  const [layout, setLayout] = useState<"list" | "grid" | "recent">(() => {
    if (typeof window === "undefined") return "list";
    return (localStorage.getItem("rift-legends-layout") as "list" | "grid" | "recent") || "list";
  });

  function switchLayout(mode: "list" | "grid" | "recent") {
    setLayout(mode);
    localStorage.setItem("rift-legends-layout", mode);
  }

  // --- Lazy member data loading ---
  const { loadedData, retryingIds, manualRetry, isMaxedOut } = useMemberData(members);

  // --- Member ordering (cached in localStorage) ---
  const orderKey = `rift-legends-order:${team.slug}`;

  function getSortedMembers() {
    if (typeof window === "undefined") return members;
    try {
      const stored = localStorage.getItem(orderKey);
      if (!stored) return members;
      const order: number[] = JSON.parse(stored);
      const byId = new Map(members.map((m) => [m.id, m]));
      const sorted: TeamMember[] = [];
      for (const id of order) {
        const m = byId.get(id);
        if (m) {
          sorted.push(m);
          byId.delete(id);
        }
      }
      // Append any new members not in the saved order
      for (const m of byId.values()) sorted.push(m);
      return sorted;
    } catch {
      return members;
    }
  }

  const [orderedMembers, setOrderedMembers] = useState(getSortedMembers);

  // Re-sort when members change (add/remove)
  useEffect(() => {
    setOrderedMembers(getSortedMembers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  function saveOrder(newOrder: TeamMember[]) {
    const ids = newOrder.map((m) => m.id);
    localStorage.setItem(orderKey, JSON.stringify(ids));
  }

  // Drag-and-drop state
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((i: number) => {
    dragIdx.current = i;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOverIdx(i);
  }, []);

  const handleDrop = useCallback((i: number) => {
    const from = dragIdx.current;
    if (from === null || from === i) {
      dragIdx.current = null;
      setDragOverIdx(null);
      return;
    }
    setOrderedMembers((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      saveOrder(next);
      return next;
    });
    dragIdx.current = null;
    setDragOverIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIdx.current = null;
    setDragOverIdx(null);
  }, []);

  // --- Recent games: merge all loaded members' matches, sorted by time ---
  const RECENT_PAGE_SIZE = 10;
  const [visibleRecentCount, setVisibleRecentCount] = useState(RECENT_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const recentGames = useMemo(() => {
    const all: { match: ProcessedMatch; member: TeamMember }[] = [];
    for (const [, data] of loadedData) {
      for (const match of data.matches) {
        all.push({ match, member: data.member });
      }
    }
    all.sort((a, b) => b.match.gameCreation - a.match.gameCreation);
    return all;
  }, [loadedData]);

  const groupedRecentGames = useMemo(() => {
    const groups: { matchId: string; entries: typeof recentGames }[] = [];
    const seen = new Map<string, (typeof groups)[0]>();

    for (const entry of recentGames) {
      const existing = seen.get(entry.match.matchId);
      if (existing) {
        existing.entries.push(entry);
      } else {
        const group = { matchId: entry.match.matchId, entries: [entry] };
        groups.push(group);
        seen.set(entry.match.matchId, group);
      }
    }
    return groups;
  }, [recentGames]);

  const visibleRecentGames = useMemo(
    () => groupedRecentGames.slice(0, visibleRecentCount),
    [groupedRecentGames, visibleRecentCount],
  );
  const hasMoreRecent = visibleRecentCount < groupedRecentGames.length;

  // Reset visible count when new data arrives
  useEffect(() => {
    setVisibleRecentCount(RECENT_PAGE_SIZE);
  }, [loadedData]);

  // IntersectionObserver to load more recent games on scroll
  useEffect(() => {
    if (layout !== "recent" || !hasMoreRecent) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleRecentCount((prev) => prev + RECENT_PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout, hasMoreRecent]);

  // On successful add: clear search and scroll to new member
  useEffect(() => {
    if (members.length > prevMemberCount.current) {
      setSearchKey((k) => k + 1);
      requestAnimationFrame(() => {
        lastMemberRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    prevMemberCount.current = members.length;
  }, [members.length]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Team Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEditing ? (
            <Form ref={emojiFormRef} method="post" className="flex-shrink-0">
              <input type="hidden" name="intent" value="update-emoji" />
              <EmojiPicker
                name="emoji"
                defaultValue={team.emoji ?? ""}
                onChange={() => {
                  requestAnimationFrame(() => emojiFormRef.current?.requestSubmit());
                }}
              />
            </Form>
          ) : (
            team.emoji && (
              <span className="flex h-10 w-10 items-center justify-center text-2xl">
                {team.emoji}
              </span>
            )
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {team.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {members.length}{" "}
              {members.length === 1 ? "member" : "members"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600">
            <Tooltip label="List">
              <button
                type="button"
                onClick={() => switchLayout("list")}
                className={`cursor-pointer rounded-l-lg px-2.5 py-1.5 ${
                  layout === "list"
                    ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white"
                    : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label="Grid">
              <button
                type="button"
                onClick={() => switchLayout("grid")}
                className={`cursor-pointer border-x border-gray-300 px-2.5 py-1.5 dark:border-gray-600 ${
                  layout === "grid"
                    ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white"
                    : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                <GridIcon className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label="Recent games">
              <button
                type="button"
                onClick={() => switchLayout("recent")}
                className={`cursor-pointer rounded-r-lg px-2.5 py-1.5 ${
                  layout === "recent"
                    ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white"
                    : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                <ClockIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isEditing
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <PencilIcon className="h-4 w-4" />
              {isEditing ? "Done" : "Edit"}
            </span>
          </button>
          {isEditing && (
            <Form method="post">
              <input type="hidden" name="intent" value="delete-team" />
              <button
                type="submit"
                onClick={(e) => {
                  if (!confirm("Delete this team? This cannot be undone.")) {
                    e.preventDefault();
                  }
                }}
                className="cursor-pointer rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
              >
                Delete Team
              </button>
            </Form>
          )}
        </div>
      </div>

      {/* Add Member Form */}
      {isEditing && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <Form method="post" className="flex gap-3">
            <input type="hidden" name="intent" value="add-member" />
            <PlayerSearch key={searchKey} version={version} />
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Add Member
            </button>
          </Form>
          {actionData?.error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {actionData.error}
            </p>
          )}
        </div>
      )}

      {/* Members */}
      {orderedMembers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">
            No members yet. Click Edit to add players using their Riot ID.
          </p>
        </div>
      ) : layout === "recent" ? (
        <div className="space-y-3">
          {loadedData.size < members.length ? (
            <div className="flex items-center justify-center gap-2 py-12">
              <svg className="h-5 w-5 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Loading matches ({loadedData.size}/{members.length})...
              </span>
            </div>
          ) : recentGames.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
              <p className="text-gray-500 dark:text-gray-400">
                No recent matches found
              </p>
            </div>
          ) : (
            <>
            {visibleRecentGames.map((group) =>
              group.entries.length > 1 ? (
                <div
                  key={group.matchId}
                  className="rounded-lg border border-amber-400 bg-amber-50/20 dark:border-amber-600 dark:bg-amber-950/10"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      Team game
                    </span>
                    <div className="flex -space-x-1.5">
                      {group.entries.map(({ member }) =>
                        member.profile_icon_id != null ? (
                          <img
                            key={member.id}
                            src={profileIconUrl(version, member.profile_icon_id)}
                            alt={member.game_name}
                            className="h-5 w-5 rounded-full ring-2 ring-amber-50 dark:ring-amber-950"
                          />
                        ) : (
                          <span
                            key={member.id}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[9px] text-gray-500 ring-2 ring-amber-50 dark:bg-gray-700 dark:text-gray-400 dark:ring-amber-950"
                          >
                            ?
                          </span>
                        ),
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {timeAgo(group.entries[0].match.gameCreation)}
                    </span>
                  </div>
                  <div className="space-y-1 px-2 pb-2">
                    {group.entries.map(({ match, member }) => (
                      <div key={member.id}>
                        <div className="mb-0.5 flex items-center gap-1.5 pl-1">
                          {member.profile_icon_id != null ? (
                            <img
                              src={profileIconUrl(version, member.profile_icon_id)}
                              alt=""
                              className="h-4 w-4 rounded-full"
                            />
                          ) : (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[8px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              ?
                            </span>
                          )}
                          <Link
                            to={`/players/${encodeURIComponent(member.game_name)}/${encodeURIComponent(member.tag_line)}`}
                            className="text-xs font-medium text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
                          >
                            {member.game_name}
                          </Link>
                        </div>
                        <MatchCard match={match} version={version} sprites={sprites} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={group.matchId}>
                  <div className="mb-0.5 flex items-center gap-1.5 pl-1">
                    {group.entries[0].member.profile_icon_id != null ? (
                      <img
                        src={profileIconUrl(version, group.entries[0].member.profile_icon_id)}
                        alt=""
                        className="h-4 w-4 rounded-full"
                      />
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[8px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        ?
                      </span>
                    )}
                    <Link
                      to={`/players/${encodeURIComponent(group.entries[0].member.game_name)}/${encodeURIComponent(group.entries[0].member.tag_line)}`}
                      className="text-xs font-medium text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
                    >
                      {group.entries[0].member.game_name}
                    </Link>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {timeAgo(group.entries[0].match.gameCreation)}
                    </span>
                  </div>
                  <MatchCard match={group.entries[0].match} version={version} sprites={sprites} />
                </div>
              ),
            )}
            {hasMoreRecent && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                <span className="text-xs text-gray-400 dark:text-gray-500">Loading more...</span>
              </div>
            )}
            </>
          )}
        </div>
      ) : layout === "list" ? (
        <div className="space-y-6">
          {orderedMembers.map((member, i) => {
            const data = loadedData.get(member.id);
            return (
              <div
                key={member.id}
                ref={i === orderedMembers.length - 1 ? lastMemberRef : undefined}
                draggable={isEditing}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                className={`${isEditing ? "cursor-grab active:cursor-grabbing" : ""} ${
                  dragOverIdx === i ? "border-t-2 border-indigo-500" : ""
                } transition-[border]`}
              >
                {data ? (
                  <MemberSection
                    data={data}
                    version={version}
                    sprites={sprites}
                    isEditing={isEditing}
                    retrying={retryingIds.has(member.id)}
                    onRetry={isMaxedOut(member.id) ? () => manualRetry(member.id) : undefined}
                  />
                ) : (
                  <MemberSectionSkeleton
                    member={member}
                    version={version}
                    isEditing={isEditing}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {orderedMembers.map((member, i) => {
            const data = loadedData.get(member.id);
            return (
              <div
                key={member.id}
                ref={i === orderedMembers.length - 1 ? lastMemberRef : undefined}
                draggable={isEditing}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                className={`${isEditing ? "cursor-grab active:cursor-grabbing" : ""} ${
                  dragOverIdx === i ? "ring-2 ring-indigo-500 rounded-lg" : ""
                } transition-shadow`}
              >
                {data ? (
                  <MemberCard
                    data={data}
                    version={version}
                    isEditing={isEditing}
                    retrying={retryingIds.has(member.id)}
                    onRetry={isMaxedOut(member.id) ? () => manualRetry(member.id) : undefined}
                  />
                ) : (
                  <MemberCardSkeleton
                    member={member}
                    version={version}
                    isEditing={isEditing}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
