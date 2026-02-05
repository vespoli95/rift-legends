import { Link } from "react-router";

export function Nav() {
  return (
    <nav className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="text-xl font-bold text-gray-900 dark:text-white"
        >
          Rift Legends
        </Link>
        <Link
          to="/teams/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Create Team
        </Link>
      </div>
    </nav>
  );
}
