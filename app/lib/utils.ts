export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatKDA(kills: number, deaths: number, assists: number): string {
  return `${kills}/${deaths}/${assists}`;
}

export function kdaRatio(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return ((kills + assists) / deaths).toFixed(2);
}

export function csPerMin(cs: number, gameDurationSeconds: number): number {
  const minutes = gameDurationSeconds / 60;
  if (minutes === 0) return 0;
  return Math.round((cs / minutes) * 10) / 10;
}

export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const trimmed = input.trim();
  const hashIndex = trimmed.lastIndexOf("#");
  if (hashIndex === -1) return null;

  const gameName = trimmed.slice(0, hashIndex).trim();
  const tagLine = trimmed.slice(hashIndex + 1).trim();

  if (!gameName || !tagLine) return null;
  if (gameName.length < 3 || gameName.length > 16) return null;
  if (tagLine.length < 2 || tagLine.length > 5) return null;

  return { gameName, tagLine };
}
