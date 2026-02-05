import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("teams/new", "routes/teams.new.tsx"),
  route("teams/:slug", "routes/teams.$slug.tsx"),
  route("players/:gameName/:tagLine", "routes/players.$gameName.$tagLine.tsx"),
  route("api/search-players", "routes/api.search-players.tsx"),
] satisfies RouteConfig;
