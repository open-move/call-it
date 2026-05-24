import { Page as ProPage } from "~/components/pro/markets/page"
import { Page as SimplePage } from "~/components/simple/markets/page"
import { AppMode } from "~/lib/callit/app-mode"
import { type ProMarket } from "~/lib/callit/pro/types"
import { type SimpleMarket } from "~/lib/callit/simple/types"

export type PageProps =
  | {
      mode: AppMode.Simple
      markets: SimpleMarket[]
    }
  | {
      mode: AppMode.Pro
      markets: ProMarket[]
    }

export function Page(props: PageProps) {
  if (props.mode === AppMode.Simple) {
    return <SimplePage markets={props.markets} />
  }

  return <ProPage markets={props.markets} />
}
