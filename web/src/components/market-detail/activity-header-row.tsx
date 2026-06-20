import { ActivityTableHeader } from "@/components/shared/activity/activity-table"

export function ActivityHeaderRow({
  className,
  columns,
}: {
  className: string
  columns: string[]
}) {
  return (
    <ActivityTableHeader
      columns={columns.map((column, index) => ({
        align: index === columns.length - 1 ? "right" : "left",
        label: column,
      }))}
      gridClassName={className}
    />
  )
}
