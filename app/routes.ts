import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("teams/new", "routes/teams.new.tsx"),
  route("teams/:slug", "routes/teams.$slug.tsx"),
  route("players/:gameName/:tagLine", "routes/players.$gameName.$tagLine.tsx"),
  route("matches/:matchId", "routes/matches.$matchId.tsx"),
  route("api/search-players", "routes/api.search-players.tsx"),
  route("api/member-history/:memberId", "routes/api.member-history.$memberId.tsx"),
  route("api/live-games/:teamId", "routes/api.live-games.$teamId.tsx"),
  route("api/live-game/:puuid", "routes/api.live-game.$puuid.tsx"),
] satisfies RouteConfig;
