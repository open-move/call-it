import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("shield", "routes/shield.tsx"),
  route("shield/:oracleId", "routes/shield-detail.tsx"),
  route("earn", "routes/earn.tsx"),
  route("portfolio", "routes/portfolio.tsx"),
  route("markets/:oracleId", "routes/market.tsx"),
] satisfies RouteConfig
