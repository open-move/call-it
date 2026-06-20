import { cn } from "@/lib/utils"
import {
  getContractKindLabel,
  getContractTextClass,
} from "@/lib/market-detail/helpers"
import type { ContractToneInput } from "@/lib/market-detail/types"

export function ContractKindTag({ row }: { row: ContractToneInput }) {
  return (
    <span
      className={cn(
        "inline-flex w-9 shrink-0 font-mono text-[10px] tracking-wide uppercase",
        getContractTextClass(row)
      )}
    >
      {getContractKindLabel(row)}
    </span>
  )
}
