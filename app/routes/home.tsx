import { Link } from "react-router";
import type { Route } from "./+types/home";
import { getAllTeams } from "~/lib/db.server";
import { TeamCard } from "~/components/team-card";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Rift Legends" },
    { name: "description", content: "League of Legends team dashboard" },
  ];
}

export function loader() {
  const teams = getAllTeams();
  return { teams };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { teams } = loaderData;
            console.log({TEST: "TEST"})  

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Teams
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Track your friends&apos; League of Legends match history
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            No teams yet
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Create a team to start tracking match history.
          </p>
          <Link
            to="/teams/new"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Create Team
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            console.log({TEST: "TEST"})  
            
            return <TeamCard key={team.id} team={team} />
          })}
        </div>
      )}
    </main>
  );
}
