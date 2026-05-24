import { Page as ProPage } from "~/components/pro/market-detail/page"
import { Page as SimplePage } from "~/components/simple/market-detail/page"
import { AppMode } from "~/lib/callit/app-mode"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import { type SimpleMarket } from "~/lib/callit/simple/types"

export type PageProps =
  | {
      mode: AppMode.Simple
      market: SimpleMarket
    }
  | {
      mode: AppMode.Pro
      market: MarketSnapshot
    }

export function Page(props: PageProps) {
  if (props.mode === AppMode.Simple) {
    return <SimplePage market={props.market} />
  }

  return <ProPage market={props.market} />
}
