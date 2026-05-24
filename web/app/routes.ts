import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("markets/:marketId", "routes/market.tsx"),
] satisfies RouteConfig
