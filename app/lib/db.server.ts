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

  // LP history table for tracking LP gain/loss per game
  d.exec(`
    CREATE TABLE IF NOT EXISTS lp_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      puuid TEXT NOT NULL,
      tier TEXT NOT NULL,
      rank TEXT NOT NULL,
      lp INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL
    )
  `);

  // Index for efficient lookups by puuid and time
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_lp_history_puuid_time
    ON lp_history (puuid, recorded_at)
  `);
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

export function searchCachedAccounts(
  query: string,
  limit = 8
): { gameName: string; tagLine: string; puuid: string }[] {
  const d = getDb();
  // Get all cached accounts and filter by gameName or tagLine
  const rows = d
    .prepare(
      `SELECT data FROM riot_cache
       WHERE cache_key LIKE 'account:%'`
    )
    .all() as { data: string }[];

  const queryLower = query.toLowerCase();
  const results: { gameName: string; tagLine: string; puuid: string }[] = [];

  for (const row of rows) {
    const parsed = JSON.parse(row.data) as { gameName: string; tagLine: string; puuid: string };
    if (
      parsed.gameName.toLowerCase().includes(queryLower) ||
      parsed.tagLine.toLowerCase().includes(queryLower)
    ) {
      results.push({ gameName: parsed.gameName, tagLine: parsed.tagLine, puuid: parsed.puuid });
      if (results.length >= limit) break;
    }
  }

  return results;
}

export function searchMatchParticipants(
  query: string,
  limit = 8
): { gameName: string; tagLine: string }[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT data FROM riot_cache WHERE cache_key LIKE 'match:%'`
    )
    .all() as { data: string }[];

  const queryLower = query.toLowerCase();
  const seen = new Set<string>();
  const results: { gameName: string; tagLine: string }[] = [];

  for (const row of rows) {
    if (results.length >= limit) break;
    try {
      const match = JSON.parse(row.data) as {
        info: {
          participants: { riotIdGameName: string; riotIdTagline: string }[];
        };
      };
      for (const p of match.info.participants) {
        if (!p.riotIdGameName || !p.riotIdTagline) continue;
        const key = `${p.riotIdGameName.toLowerCase()}#${p.riotIdTagline.toLowerCase()}`;
        if (seen.has(key)) continue;
        if (p.riotIdGameName.toLowerCase().includes(queryLower)) {
          seen.add(key);
          results.push({ gameName: p.riotIdGameName, tagLine: p.riotIdTagline });
          if (results.length >= limit) break;
        }
      }
    } catch {
      // Skip malformed cache entries
    }
  }

  return results;
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

// --- LP History ---

export interface LpSnapshot {
  tier: string;
  rank: string;
  lp: number;
  wins: number;
  losses: number;
  recorded_at: number;
}

/**
 * Record an LP snapshot, but only if the wins/losses changed since the last snapshot.
 * This avoids storing duplicate entries when ranked data hasn't changed.
 */
export function recordLpSnapshot(
  puuid: string,
  tier: string,
  rank: string,
  lp: number,
  wins: number,
  losses: number,
): void {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Check if last snapshot has the same wins+losses (no new games played)
  const last = d
    .prepare(
      "SELECT wins, losses FROM lp_history WHERE puuid = ? ORDER BY recorded_at DESC LIMIT 1"
    )
    .get(puuid) as { wins: number; losses: number } | undefined;

  if (last && last.wins === wins && last.losses === losses) {
    return; // No change, skip recording
  }

  d.prepare(
    "INSERT INTO lp_history (puuid, tier, rank, lp, wins, losses, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(puuid, tier, rank, lp, wins, losses, now);
}

/**
 * Get LP snapshots for a puuid, ordered by recorded_at ascending.
 */
export function getLpSnapshots(puuid: string, limit = 100): LpSnapshot[] {
  const d = getDb();
  return d
    .prepare(
      "SELECT tier, rank, lp, wins, losses, recorded_at FROM lp_history WHERE puuid = ? ORDER BY recorded_at ASC LIMIT ?"
    )
    .all(puuid, limit) as LpSnapshot[];
}

/**
 * Get the most recent LP snapshot for a puuid, or null if none exists.
 */
export function getLatestLpSnapshot(puuid: string): LpSnapshot | null {
  const d = getDb();
  return (
    d
      .prepare(
        "SELECT tier, rank, lp, wins, losses, recorded_at FROM lp_history WHERE puuid = ? ORDER BY recorded_at DESC LIMIT 1"
      )
      .get(puuid) as LpSnapshot | undefined
  ) ?? null;
}
