import { useEffect, useRef, useState, useCallback } from "react";
import { useFetcher } from "react-router";
import { profileIconUrl } from "~/lib/ddragon";

interface SearchResult {
  gameName: string;
  tagLine: string;
  profileIconId: number | null;
  source: "local" | "riot" | "cached" | "recent";
}

const RECENT_SEARCHES_KEY = "rift-legends-recent-searches";
const MAX_RECENT = 5;

function getRecentSearches(): SearchResult[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(result: SearchResult) {
  if (typeof window === "undefined") return;
  const recent = getRecentSearches().filter(
    (r) => !(r.gameName === result.gameName && r.tagLine === result.tagLine)
  );
  recent.unshift({ ...result, source: "recent" });
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(recent.slice(0, MAX_RECENT))
  );
}

export function PlayerSearch({ version }: { version: string }) {
  const fetcher = useFetcher<SearchResult[]>();
  const [query, setQuery] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const results = fetcher.data ?? [];
  const isLoading = fetcher.state === "loading";
  const [hasFetched, setHasFetched] = useState(false);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const fetchResults = useCallback(
    (q: string) => {
      if (q.length < 1) return;
      setHasFetched(true);
      fetcher.load(`/api/search-players?q=${encodeURIComponent(q)}`);
    },
    [fetcher]
  );

  function handleInputChange(value: string) {
    setQuery(value);
    setSelectedValue("");
    setActiveIndex(-1);
    setHasFetched(false);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.length < 1) {
      setShowDropdown(false);
      return;
    }

    setShowDropdown(true);
    debounceRef.current = setTimeout(() => fetchResults(value), 300);
  }

  function selectResult(result: SearchResult) {
    const riotId = `${result.gameName}#${result.tagLine}`;
    setQuery(riotId);
    setSelectedValue(riotId);
    setShowDropdown(false);
    setActiveIndex(-1);
    addRecentSearch(result);
    setRecentSearches(getRecentSearches());
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const displayedResults = query.length === 0 ? recentSearches : results;
    if (!showDropdown || displayedResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < displayedResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : displayedResults.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectResult(displayedResults[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Show dropdown when results arrive
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && query.length >= 1 && !selectedValue) {
      setShowDropdown(true);
    }
  }, [fetcher.state, fetcher.data, query, selectedValue]);

  return (
    <div className="relative flex-1">
      <input type="hidden" name="riotId" value={selectedValue || query} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (query.length === 0 && recentSearches.length > 0 && !selectedValue) {
            setShowDropdown(true);
          } else if (results.length > 0 && query.length >= 1 && !selectedValue) {
            setShowDropdown(true);
          }
        }}
        placeholder="Riot ID (e.g. Player#NA1)"
        autoComplete="off"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
      />

      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-500" />
        </div>
      )}

      {showDropdown && (isLoading || hasFetched || (query.length === 0 && recentSearches.length > 0)) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {query.includes("#") ? "Looking up Riot ID..." : "Searching..."}
            </div>
          ) : query.length === 0 && recentSearches.length > 0 ? (
            <>
              <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                Recent
              </div>
              <ul>
                {recentSearches.map((result, index) => (
                  <li key={`${result.gameName}#${result.tagLine}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectResult(result);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm ${
                        index === activeIndex
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                          : "text-gray-900 dark:text-white"
                      } ${index === recentSearches.length - 1 ? "rounded-b-lg" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        {result.profileIconId != null ? (
                          <img
                            src={profileIconUrl(version, result.profileIconId)}
                            alt=""
                            className="h-5 w-5 rounded-full"
                          />
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            ?
                          </span>
                        )}
                        <span>
                          {result.gameName}
                          <span className="text-gray-400 dark:text-gray-500">
                            #{result.tagLine}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {query.includes("#")
                ? "No player found — double-check the name and tag"
                : "No local matches — type a full Riot ID with # tag to search (e.g. Player#NA1)"}
            </div>
          ) : (
            <ul>
              {results.map((result, index) => (
                <li key={`${result.gameName}#${result.tagLine}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectResult(result);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm ${
                      index === activeIndex
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "text-gray-900 dark:text-white"
                    } ${index === 0 ? "rounded-t-lg" : ""} ${
                      index === results.length - 1 ? "rounded-b-lg" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {result.profileIconId != null ? (
                        <img
                          src={profileIconUrl(version, result.profileIconId)}
                          alt=""
                          className="h-5 w-5 rounded-full"
                        />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          ?
                        </span>
                      )}
                      <span>
                        {result.gameName}
                        <span className="text-gray-400 dark:text-gray-500">
                          #{result.tagLine}
                        </span>
                      </span>
                    </span>
                    {result.source === "riot" && (
                      <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                        Riot API
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
