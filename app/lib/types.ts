export interface Team {
  id: number;
  name: string;
  slug: string;
  emoji: string | null;
  created_at: string;
}

export interface TeamWithCount extends Team {
  member_count: number;
}

export interface TeamMember {
  id: number;
  team_id: number;
  game_name: string;
  tag_line: string;
  puuid: string | null;
  profile_icon_id: number | null;
  created_at: string;
}

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface MatchDetail {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp: number;
    gameMode: string;
    queueId: number;
    participants: MatchParticipant[];
  };
}

export interface MatchParticipant {
  puuid: string;
  summonerName: string;
  riotIdGameName: string;
  riotIdTagline: string;
  championId: number;
  championName: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  visionScore: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  win: boolean;
  teamPosition: string;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
}

export interface ProcessedMatch {
  matchId: string;
  win: boolean;
  championName: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  csPerMin: number;
  visionScore: number;
  items: number[];
  trinket: number;
  summoner1Id: number;
  summoner2Id: number;
  gameDuration: number;
  queueId: number;
  gameCreation: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  gameRank: number;
  teamPosition: string;
  lpChange?: number;
}

export interface RankedInfo {
  tier: string;
  rank: string;
  lp: number;
  wins: number;
  losses: number;
}

export interface MemberWithMatches {
  member: TeamMember;
  matches: ProcessedMatch[];
  ranked?: RankedInfo | null;
  error?: string;
}
