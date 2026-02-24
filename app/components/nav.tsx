import { Link, useNavigation } from "react-router";

export function Nav() {
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  return (
    <nav className="relative border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      {isNavigating && (
        <div className="absolute inset-x-0 bottom-0 z-50 h-0.5 overflow-hidden bg-indigo-100 dark:bg-indigo-950">
          <div className="h-full w-1/3 animate-[slide_1s_ease-in-out_infinite] bg-indigo-500 dark:bg-indigo-400" />
        </div>
      )}
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
