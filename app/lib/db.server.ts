import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Team, TeamWithCount, TeamMember } from "./types";

// Use /data on Fly.io (persistent volume), local data/ dir otherwise
const DATA_DIR = fs.existsSync("/data") ? "/data" : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "rift-legends.db");

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      game_name TEXT NOT NULL,
      tag_line TEXT NOT NULL,
      puuid TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(team_id, game_name, tag_line)
    );

    CREATE TABLE IF NOT EXISTS riot_cache (
      cache_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cached_players (
      game_name TEXT NOT NULL,
      tag_line TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (game_name, tag_line)
    );
  `);

  // Migrations for new columns
  const columns = d
    .prepare("PRAGMA table_info(team_members)")
    .all() as { name: string }[];
  const colNames = columns.map((c) => c.name);

  if (!colNames.includes("profile_icon_id")) {
    d.exec("ALTER TABLE team_members ADD COLUMN profile_icon_id INTEGER");
  }

  const teamColumns = d
    .prepare("PRAGMA table_info(teams)")
    .all() as { name: string }[];
  const teamColNames = teamColumns.map((c) => c.name);

  if (!teamColNames.includes("emoji")) {
    d.exec("ALTER TABLE teams ADD COLUMN emoji TEXT");
  }
}

// --- Teams ---

export function getAllTeams(): TeamWithCount[] {
  const d = getDb();
  return d
    .prepare(
      `SELECT t.*, COUNT(tm.id) as member_count
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    )
    .all() as TeamWithCount[];
}

export function getTeamBySlug(slug: string): Team | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM teams WHERE slug = ?").get(slug) as Team | undefined;
}

export function createTeam(name: string, slug: string, emoji?: string): Team {
  const d = getDb();
  const result = d
    .prepare("INSERT INTO teams (name, slug, emoji) VALUES (?, ?, ?)")
    .run(name, slug, emoji ?? null);
  return d.prepare("SELECT * FROM teams WHERE id = ?").get(result.lastInsertRowid) as Team;
}

export function updateTeamEmoji(teamId: number, emoji: string): void {
  const d = getDb();
  d.prepare("UPDATE teams SET emoji = ? WHERE id = ?").run(emoji, teamId);
}

export function deleteTeam(id: number): void {
  const d = getDb();
  d.prepare("DELETE FROM teams WHERE id = ?").run(id);
}

export function slugExists(slug: string): boolean {
  const d = getDb();
  const row = d.prepare("SELECT 1 FROM teams WHERE slug = ?").get(slug);
  return !!row;
}

// --- Team Members ---

export function getTeamMembers(teamId: number): TeamMember[] {
  const d = getDb();
  return d
    .prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY created_at ASC")
    .all(teamId) as TeamMember[];
}

export function getTeamMemberById(memberId: number): TeamMember | undefined {
  const d = getDb();
  return d
    .prepare("SELECT * FROM team_members WHERE id = ?")
    .get(memberId) as TeamMember | undefined;
}

export function addTeamMember(
  teamId: number,
  gameName: string,
  tagLine: string,
  puuid: string,
  profileIconId?: number
): TeamMember {
  const d = getDb();
  const result = d
    .prepare(
      "INSERT INTO team_members (team_id, game_name, tag_line, puuid, profile_icon_id) VALUES (?, ?, ?, ?, ?)"
    )
    .run(teamId, gameName, tagLine, puuid, profileIconId ?? null);
  return d
    .prepare("SELECT * FROM team_members WHERE id = ?")
    .get(result.lastInsertRowid) as TeamMember;
}

export function removeTeamMember(memberId: number, teamId: number): void {
  const d = getDb();
  d.prepare("DELETE FROM team_members WHERE id = ? AND team_id = ?").run(memberId, teamId);
}

// --- Search ---

export function searchMembers(
  query: string,
  limit = 8
): { game_name: string; tag_line: string; profile_icon_id: number | null }[] {
  const d = getDb();
  const pattern = `%${query}%`;
  return d
    .prepare(
      `SELECT game_name, tag_line, MAX(profile_icon_id) as profile_icon_id FROM team_members
       WHERE game_name LIKE ? COLLATE NOCASE OR tag_line LIKE ? COLLATE NOCASE
       GROUP BY game_name, tag_line
       ORDER BY game_name ASC
       LIMIT ?`
    )
    .all(pattern, pattern, limit) as { game_name: string; tag_line: string; profile_icon_id: number | null }[];
}

export function searchCachedPlayers(
  query: string,
  limit = 8
): { gameName: string; tagLine: string }[] {
  const d = getDb();
  const pattern = `%${query}%`;
  return d
    .prepare(
      `SELECT game_name AS gameName, tag_line AS tagLine FROM cached_players
       WHERE game_name LIKE ? COLLATE NOCASE
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(pattern, limit) as { gameName: string; tagLine: string }[];
}

export function upsertCachedPlayers(
  players: { gameName: string; tagLine: string; source: string }[]
): void {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  const stmt = d.prepare(
    `INSERT INTO cached_players (game_name, tag_line, source, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(game_name, tag_line) DO UPDATE SET source = excluded.source, updated_at = excluded.updated_at`
  );
  const runMany = d.transaction((entries: typeof players) => {
    for (const p of entries) {
      stmt.run(p.gameName, p.tagLine, p.source, now);
    }
  });
  runMany(players);
}

export function getCachedSummoner(puuid: string): { profileIconId: number } | null {
  const d = getDb();
  const row = d
    .prepare("SELECT data FROM riot_cache WHERE cache_key = ?")
    .get(`summoner:${puuid}`) as { data: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.data) as { profileIconId: number };
}

// --- Cache ---

export function cacheGet<T>(key: string, ttlSeconds: number): T | null {
  const d = getDb();
  const row = d
    .prepare("SELECT data, cached_at FROM riot_cache WHERE cache_key = ?")
    .get(key) as { data: string; cached_at: number } | undefined;

  if (!row) return null;

  const age = Math.floor(Date.now() / 1000) - row.cached_at;
  if (age > ttlSeconds) {
    d.prepare("DELETE FROM riot_cache WHERE cache_key = ?").run(key);
    return null;
  }

  return JSON.parse(row.data) as T;
}

export function cacheSet(key: string, data: unknown): void {
  const d = getDb();
  d.prepare(
    "INSERT OR REPLACE INTO riot_cache (cache_key, data, cached_at) VALUES (?, ?, ?)"
  ).run(key, JSON.stringify(data), Math.floor(Date.now() / 1000));
}

// Max age per cache key prefix (seconds). Anything older gets pruned.
const CACHE_MAX_AGES: [string, number][] = [
  ["match:", 7 * 24 * 60 * 60],       // 7 days
  ["account:", 24 * 60 * 60],          // 24h
  ["summoner:", 24 * 60 * 60],         // 24h
  ["ranked:", 60 * 60],                // 1h
  ["matches:", 30 * 60],               // 30min
  ["season-ids:", 30 * 60],            // 30min
  ["active-game:", 5 * 60],            // 5min
  ["sprites:", 7 * 24 * 60 * 60],      // 7 days
  ["ddragon:", 24 * 60 * 60],          // 24h
];

export function pruneCache(): number {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  let totalDeleted = 0;

  for (const [prefix, maxAge] of CACHE_MAX_AGES) {
    const result = d
      .prepare("DELETE FROM riot_cache WHERE cache_key LIKE ? AND cached_at < ?")
      .run(`${prefix}%`, now - maxAge);
    totalDeleted += result.changes;
  }

  // Safety net: delete any row older than 14 days regardless of prefix
  const fallback = d
    .prepare("DELETE FROM riot_cache WHERE cached_at < ?")
    .run(now - 14 * 24 * 60 * 60);
  totalDeleted += fallback.changes;

  return totalDeleted;
}

// Run pruning on startup and every 10 minutes
pruneCache();
setInterval(() => {
  try {
    const deleted = pruneCache();
    if (deleted > 0) console.log(`[db] pruned ${deleted} expired cache rows`);
  } catch (e) {
    console.error("[db] cache prune failed:", e);
  }
}, 10 * 60 * 1000);
