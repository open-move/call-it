import { ActivityCenteredEmptyState } from "@/components/shared/activity/activity-table"

export function EmptyState({ message }: { message: string }) {
  return <ActivityCenteredEmptyState message={message} />
}
