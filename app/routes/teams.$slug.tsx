import { useState } from "react";
import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/teams.$slug";
import {
  getTeamBySlug,
  getTeamMembers,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  updateTeamEmoji,
} from "~/lib/db.server";
import { getCurrentVersion } from "~/lib/ddragon.server";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  getMemberMatchHistory,
  RiotApiError,
} from "~/lib/riot-api.server";
import { parseRiotId } from "~/lib/utils";
import { MemberSection } from "~/components/member-section";
import { PlayerSearch } from "~/components/player-search";
import type { MemberWithMatches } from "~/lib/types";

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

  const memberData: MemberWithMatches[] = await Promise.all(
    members.map((member) => getMemberMatchHistory(member)),
  );

  return { team, memberData, version };
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

export default function TeamDetail({ loaderData }: Route.ComponentProps) {
  const { team, memberData, version } = loaderData;
  const actionData = useActionData<typeof action>();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Team Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEditing ? (
            <Form method="post" className="flex-shrink-0">
              <input type="hidden" name="intent" value="update-emoji" />
              <input
                type="text"
                name="emoji"
                defaultValue={team.emoji ?? ""}
                maxLength={2}
                placeholder="+"
                onBlur={(e) => e.target.form?.requestSubmit()}
                className="h-10 w-10 rounded-lg border border-gray-200 bg-white text-center text-xl leading-none hover:border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
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
              {memberData.length}{" "}
              {memberData.length === 1 ? "member" : "members"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            <PlayerSearch version={version} />
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
      {memberData.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">
            No members yet. Click Edit to add players using their Riot ID.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {memberData.map((data) => (
            <MemberSection
              key={data.member.id}
              data={data}
              version={version}
              isEditing={isEditing}
            />
          ))}
        </div>
      )}
    </main>
  );
}
